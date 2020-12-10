import * as express from "express";

import { Context } from "@azure/functions";
import { identity } from "fp-ts/lib/function";
import { fromNullable, isNone, Option, some } from "fp-ts/lib/Option";
import {
  fromEither,
  fromLeft,
  TaskEither,
  taskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";
import { ProfileModel } from "io-functions-commons/dist/src/models/profile";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "io-functions-commons/dist/src/utils/response";
import {
  IResponseErrorNotFound,
  IResponseErrorValidation,
  IResponseSuccessJson,
  ResponseErrorNotFound,
  ResponseErrorValidation,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { EmailString } from "italia-ts-commons/lib/strings";
import { PagoPAUser } from "../generated/definitions/PagoPAUser";
import { User } from "../types/user";
import { RequiredExpressUserMiddleware } from "../utils/middleware/required_express_user";
import SessionStorage from "../utils/sessionStorage";

type IHttpHandler = (
  context: Context,
  user: User
) => Promise<IPagoPaGetUserHandlerResult>;

type IPagoPaGetUserHandlerResult =
  | IResponseSuccessJson<PagoPAUser>
  | IResponseErrorNotFound
  | IResponseErrorValidation
  | IResponseErrorQuery;

export function PagoPaGetUserHandler(
  profileModel: ProfileModel,
  sessionStorage: SessionStorage,
  enableNoticeEmailCache: boolean
): IHttpHandler {
  return async (_CTX, user) => {
    const getProfileAndSaveNoticeEmailCache = profileModel
      .findLastVersionByModelId([user.fiscal_code])
      .foldTaskEither<
        IResponseErrorNotFound | IResponseErrorQuery,
        Option<EmailString>
      >(
        failure =>
          fromLeft(
            ResponseErrorQuery("Error while retrieving the profile", failure)
          ),
        maybeProfile =>
          maybeProfile.fold<
            TaskEither<IResponseErrorNotFound, Option<EmailString>>
          >(
            fromLeft<IResponseErrorNotFound, Option<EmailString>>(
              ResponseErrorNotFound(
                "Profile not found",
                "The profile you requested was not found in the system."
              )
            ),
            profile => {
              const maybeNoticeEmail: EmailString | undefined =
                profile.email && profile.isEmailValidated
                  ? profile.email
                  : user.spid_email;
              return taskEither.of(fromNullable(maybeNoticeEmail));
            }
          )
      ) // Save the value into the redis cache
      .chain(maybeNoticeEmail => {
        if (isNone(maybeNoticeEmail)) {
          return taskEither.of(maybeNoticeEmail as Option<EmailString>);
        }
        return tryCatch(
          () =>
            sessionStorage.setPagoPaNoticeEmail(user, maybeNoticeEmail.value),
          () => new Error("Error caching the notify email value")
        ).foldTaskEither(
          _1 => taskEither.of(maybeNoticeEmail),
          _1 => taskEither.of(maybeNoticeEmail)
        );
      });
    return (enableNoticeEmailCache
      ? tryCatch(
          () => sessionStorage.getPagoPaNoticeEmail(user),
          _ => new Error("Error reading the notify email cache")
        )
          .foldTaskEither(_ => fromLeft<Error, EmailString>(_), fromEither)
          .foldTaskEither(
            _ => getProfileAndSaveNoticeEmailCache,
            _ => taskEither.of(some(_))
          )
      : getProfileAndSaveNoticeEmailCache
    )
      .fold<IPagoPaGetUserHandlerResult>(identity, maybeNoticeEmail =>
        PagoPAUser.decode({
          family_name: user.family_name,
          fiscal_code: user.fiscal_code,
          mobile_phone: user.spid_mobile_phone,
          name: user.name,
          notice_email: maybeNoticeEmail.toUndefined(),
          spid_email: user.spid_email
        }).fold<IResponseSuccessJson<PagoPAUser> | IResponseErrorValidation>(
          _1 =>
            ResponseErrorValidation("Validation Error", "Invalid User Data"),
          ResponseSuccessJson
        )
      )
      .run();
  };
}

export function PagoPaGetUser(
  profileModel: ProfileModel,
  sessionStorage: SessionStorage,
  enableNoticeEmailCache: boolean
): express.RequestHandler {
  const handler = PagoPaGetUserHandler(
    profileModel,
    sessionStorage,
    enableNoticeEmailCache
  );

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredExpressUserMiddleware(User)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
