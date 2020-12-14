import { IRequestMiddleware } from "io-functions-commons/dist/src/utils/request_middleware";
import * as t from "io-ts";
import { ResponseErrorFromValidationErrors } from "italia-ts-commons/lib/responses";

export function RequiredExpressUserMiddleware<S, A>(
  type: t.Type<A, S>
): IRequestMiddleware<"IResponseErrorValidation", A> {
  return async request => {
    return type
      .decode(request.user)
      .mapLeft(_ => ResponseErrorFromValidationErrors(type)(_));
  };
}
