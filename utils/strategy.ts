/**
 * Builds and configure a Passport strategy to authenticate the proxy clients.
 */
import * as express from "express";
import { Either } from "fp-ts/lib/Either";
import { Option } from "fp-ts/lib/Option";
import { IVerifyOptions } from "passport-http-bearer";
import * as passport from "passport-http-bearer";
import { WalletToken } from "../types/token";
import { User } from "../types/user";
import SessionStorage from "./sessionStorage";

export type StrategyDoneFunction = (
  // tslint:disable-next-line: no-any
  error: any,
  // tslint:disable-next-line: no-any
  user?: any,
  options?: IVerifyOptions | string
) => void;

/**
 * This method invokes Passport Strategy done function
 * with proper parameters depending on the response of
 * methods getBySessionToken or getByWalletToken.
 */
export function fulfill(
  errorOrUser: Either<Error, Option<User>>,
  done: StrategyDoneFunction
): void {
  errorOrUser.fold(
    error => done(error),
    user => done(undefined, user.isNone() ? false : user.value)
  );
}

const bearerWalletTokenStrategy = (
  sessionStorage: SessionStorage
  // tslint:disable-next-line: no-any
): passport.Strategy<any> => {
  const options = {
    passReqToCallback: true,
    realm: "Proxy API",
    scope: "request"
  };
  return new passport.Strategy(
    options,
    (_: express.Request, token: string, done: StrategyDoneFunction) => {
      sessionStorage.getByWalletToken(token as WalletToken).then(
        (errorOrUser: Either<Error, Option<User>>) => {
          try {
            fulfill(errorOrUser, done);
          } catch (e) {
            // The error is forwarded to the express error middleware
            done(e);
          }
        },
        () => {
          try {
            done(undefined, false);
          } catch (e) {
            // The error is forwarded to the express error middleware
            done(e);
          }
        }
      );
    }
  );
};

export default bearerWalletTokenStrategy;
