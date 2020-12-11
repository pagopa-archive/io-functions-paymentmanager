import { left, right } from "fp-ts/lib/Either";
import { none, some } from "fp-ts/lib/Option";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import {
  ProfileModel,
  RetrievedProfile
} from "io-functions-commons/dist/src/models/profile";
import { toCosmosErrorResponse } from "io-functions-commons/dist/src/utils/cosmosdb_model";
import { NonNegativeInteger } from "italia-ts-commons/lib/numbers";
import {
  EmailString,
  FiscalCode,
  NonEmptyString
} from "italia-ts-commons/lib/strings";
import {
  BPDToken,
  MyPortalToken,
  SessionToken,
  WalletToken
} from "../../types/token";
import { User } from "../../types/user";
import SessionStorage from "../../utils/sessionStorage";
import { PagoPaGetUserHandler } from "../handler";

const aFiscalCode: FiscalCode = "RSSMRI01A02B123C" as FiscalCode;
const aWalletToken: WalletToken = "wallet-token" as WalletToken;
const aSessionToken: SessionToken = "session-token" as SessionToken;

const aValidUser: User = {
  name: "Mario",
  family_name: "Rossi",
  fiscal_code: aFiscalCode,
  spid_level: "SpidL2",
  created_at: Date.now(),
  bpd_token: "token" as BPDToken,
  session_token: aSessionToken,
  myportal_token: "token" as MyPortalToken,
  wallet_token: aWalletToken
};

const aUserEmail = "email@example.it" as EmailString;

const aUserProfile: RetrievedProfile = {
  fiscalCode: aValidUser.fiscal_code,
  kind: "IRetrievedProfile",
  id: "01" as NonEmptyString,
  version: 1 as NonNegativeInteger,
  email: aUserEmail,
  isEmailValidated: true,
  _etag: "1",
  _ts: 1,
  _rid: "1",
  _self: "1"
};

const mockFindLastVersionByModelId = jest
  .fn()
  .mockImplementation(() => taskEither.of(some(aUserProfile)));
const profileModel = ({
  findLastVersionByModelId: mockFindLastVersionByModelId
} as unknown) as ProfileModel;

const mockGetPagoPaNoticeEmail = jest
  .fn()
  .mockImplementation(() => Promise.resolve(right(aUserEmail)));
const mockSetPagoPaNoticeEmail = jest
  .fn()
  .mockImplementation(() => Promise.resolve(right(true)));

const sessionStorage = ({
  getPagoPaNoticeEmail: mockGetPagoPaNoticeEmail,
  setPagoPaNoticeEmail: mockSetPagoPaNoticeEmail
} as unknown) as SessionStorage;

describe("PagoPaGetUserHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should succeded with a valid user", async () => {
    const handler = PagoPaGetUserHandler(profileModel, sessionStorage, false);
    const response = await handler({} as any, aValidUser);
    expect(mockGetPagoPaNoticeEmail).not.toBeCalled();
    expect(mockSetPagoPaNoticeEmail).toBeCalledWith(
      aValidUser,
      aUserProfile.email
    );
    expect(response.kind).toEqual("IResponseSuccessJson");
  });

  it("should returns a validation error if the email is not validated", async () => {
    mockFindLastVersionByModelId.mockImplementationOnce(() =>
      taskEither.of(
        some({
          ...aUserProfile,
          isEmailValidated: false
        })
      )
    );
    const handler = PagoPaGetUserHandler(profileModel, sessionStorage, false);
    const response = await handler({} as any, aValidUser);
    expect(mockGetPagoPaNoticeEmail).not.toBeCalled();
    expect(mockSetPagoPaNoticeEmail).not.toBeCalled();
    expect(response.kind).toEqual("IResponseErrorValidation");
  });

  it("should returns 404 if the profile is missing", async () => {
    mockFindLastVersionByModelId.mockImplementationOnce(() =>
      taskEither.of(none)
    );
    const handler = PagoPaGetUserHandler(profileModel, sessionStorage, false);
    const response = await handler({} as any, aValidUser);
    expect(mockGetPagoPaNoticeEmail).not.toBeCalled();
    expect(mockSetPagoPaNoticeEmail).not.toBeCalled();
    expect(response.kind).toEqual("IResponseErrorNotFound");
  });

  it("should returns 500 if an error occurs reading the profile", async () => {
    mockFindLastVersionByModelId.mockImplementationOnce(() =>
      fromLeft(toCosmosErrorResponse(new Error("Cosmos error")))
    );
    const handler = PagoPaGetUserHandler(profileModel, sessionStorage, false);
    const response = await handler({} as any, aValidUser);
    expect(mockGetPagoPaNoticeEmail).not.toBeCalled();
    expect(mockSetPagoPaNoticeEmail).not.toBeCalled();
    expect(response.kind).toEqual("IResponseErrorQuery");
  });

  it("should succeded with a valid notice_email cache value", async () => {
    const handler = PagoPaGetUserHandler(profileModel, sessionStorage, true);
    const response = await handler({} as any, aValidUser);
    expect(mockGetPagoPaNoticeEmail).toBeCalledWith(aValidUser);
    expect(mockSetPagoPaNoticeEmail).not.toBeCalled();
    expect(response.kind).toEqual("IResponseSuccessJson");
  });

  it("should succeded with a missing notice_email cache value", async () => {
    mockGetPagoPaNoticeEmail.mockImplementationOnce(() =>
      Promise.resolve(left(new Error("Missing key")))
    );
    const handler = PagoPaGetUserHandler(profileModel, sessionStorage, true);
    const response = await handler({} as any, aValidUser);
    expect(mockGetPagoPaNoticeEmail).toBeCalledWith(aValidUser);
    expect(mockSetPagoPaNoticeEmail).toBeCalledWith(
      aValidUser,
      aUserProfile.email
    );
    expect(response.kind).toEqual("IResponseSuccessJson");
  });
});
