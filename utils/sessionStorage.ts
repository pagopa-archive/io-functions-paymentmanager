import {
  Either,
  isLeft,
  left,
  parseJSON,
  right,
  toError
} from "fp-ts/lib/Either";
import { none, Option, some } from "fp-ts/lib/Option";
import { TaskEither, taskify } from "fp-ts/lib/TaskEither";
import { errorsToReadableMessages } from "italia-ts-commons/lib/reporters";
import { EmailString } from "italia-ts-commons/lib/strings";
import * as redis from "redis";
import {
  BPDToken,
  MyPortalToken,
  SessionToken,
  WalletToken
} from "../types/token";
import { User } from "../types/user";

const sessionKeyPrefix = "SESSION-";
const walletKeyPrefix = "WALLET-";
const noticeEmailPrefix = "NOTICEEMAIL-";
export const sessionNotFoundError = new Error("Session not found");

export default class SessionStorage {
  private ttlTask: (key: string) => TaskEither<Error, number>;
  constructor(private readonly redisClient: redis.RedisClient) {
    this.ttlTask = taskify(this.redisClient.ttl.bind(this.redisClient));
  }

  public async getByWalletToken(
    token: WalletToken
  ): Promise<Either<Error, Option<User>>> {
    const errorOrSession = await this.loadSessionByToken(
      walletKeyPrefix,
      token
    );

    if (isLeft(errorOrSession)) {
      if (errorOrSession.value === sessionNotFoundError) {
        return right(none);
      }
      return left(errorOrSession.value);
    }

    const user = errorOrSession.value;

    return right(some(user));
  }

  /**
   * Cache on redis the notify email for pagopa
   */
  public async setPagoPaNoticeEmail(
    user: User,
    NoticeEmail: EmailString
  ): Promise<Either<Error, boolean>> {
    const errorOrSessionTtl = await this.getSessionTtl(user.session_token);

    if (isLeft(errorOrSessionTtl)) {
      return left(
        new Error(
          `Error retrieving user session ttl [${errorOrSessionTtl.value.message}]`
        )
      );
    }
    const sessionTtl = errorOrSessionTtl.value;
    if (sessionTtl < 0) {
      throw new Error(`Unexpected session TTL value [${sessionTtl}]`);
    }

    return new Promise<Either<Error, boolean>>(resolve => {
      this.redisClient.set(
        `${noticeEmailPrefix}${user.session_token}`,
        NoticeEmail,
        "EX",
        sessionTtl,
        (err, response) =>
          resolve(
            this.falsyResponseToError(
              this.singleStringReply(err, response),
              new Error("Error setting session token")
            )
          )
      );
    });
  }

  /**
   * Delete notify email cache related to an user
   */
  public async delPagoPaNoticeEmail(user: User): Promise<Either<Error, true>> {
    return new Promise<Either<Error, true>>(resolve => {
      this.redisClient.del(`${noticeEmailPrefix}${user.session_token}`, err =>
        resolve(err ? left(err) : right(true))
      );
    });
  }

  /**
   * Get the notify email value from cache
   */
  public async getPagoPaNoticeEmail(
    user: User
  ): Promise<Either<Error, EmailString>> {
    return new Promise<Either<Error, EmailString>>(resolve => {
      this.redisClient.get(
        `${noticeEmailPrefix}${user.session_token}`,
        (err, value) => {
          if (err) {
            // Client returns an error.
            return resolve(left<Error, EmailString>(err));
          }

          if (value === null) {
            return resolve(
              left<Error, EmailString>(
                new Error("Notify email value not found")
              )
            );
          }
          const errorOrNoticeEmail = EmailString.decode(value).mapLeft(
            validationErrors =>
              new Error(errorsToReadableMessages(validationErrors).join("/"))
          );
          return resolve(errorOrNoticeEmail);
        }
      );
    });
  }

  /**
   * Parse a Redis single string reply.
   *
   * @see https://redis.io/topics/protocol#simple-string-reply.
   */
  protected singleStringReply(
    err: Error | null,
    reply: "OK" | undefined
  ): Either<Error, boolean> {
    if (err) {
      return left<Error, boolean>(err);
    }

    return right<Error, boolean>(reply === "OK");
  }

  protected falsyResponseToError(
    response: Either<Error, boolean>,
    error: Error
  ): Either<Error, true> {
    if (isLeft(response)) {
      return left(response.value);
    } else {
      if (response.value) {
        return right(true);
      }
      return left(error);
    }
  }

  private parseUser(value: string): Either<Error, User> {
    return parseJSON<Error>(value, toError).chain(data => {
      return User.decode(data).mapLeft(err => {
        return new Error(errorsToReadableMessages(err).join("/"));
      });
    });
  }

  /**
   * Return a Session for this token.
   */
  private async loadSessionBySessionToken(
    token: SessionToken
  ): Promise<Either<Error, User>> {
    return new Promise(resolve => {
      this.redisClient.get(`${sessionKeyPrefix}${token}`, (err, value) => {
        if (err) {
          // Client returns an error.
          return resolve(left<Error, User>(err));
        }

        if (value === null) {
          return resolve(left<Error, User>(sessionNotFoundError));
        }
        const errorOrDeserializedUser = this.parseUser(value);
        return resolve(errorOrDeserializedUser);
      });
    });
  }

  /**
   * Return a Session for this token.
   */
  private loadSessionByToken(
    prefix: string,
    token: WalletToken | MyPortalToken | BPDToken
  ): Promise<Either<Error, User>> {
    return new Promise(resolve => {
      this.redisClient.get(`${prefix}${token}`, (err, value) => {
        if (err) {
          // Client returns an error.
          return resolve(left<Error, User>(err));
        }

        if (value === null) {
          return resolve(left<Error, User>(sessionNotFoundError));
        }

        this.loadSessionBySessionToken(value as SessionToken).then(
          (errorOrSession: Either<Error, User>) => {
            errorOrSession.fold(
              error => resolve(left<Error, User>(error)),
              session => {
                resolve(right<Error, User>(session));
              }
            );
          },
          error => {
            resolve(left<Error, User>(error));
          }
        );
      });
    });
  }

  /**
   * Return the session token remaining time to live in seconds
   * @param token
   */
  private async getSessionTtl(
    token: SessionToken
  ): Promise<Either<Error, number>> {
    // Returns the key ttl in seconds
    // -2 if the key doesn't exist or -1 if the key has no expire
    // @see https://redis.io/commands/ttl
    return this.ttlTask(`${sessionKeyPrefix}${token}`).run();
  }
}
