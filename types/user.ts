import * as t from "io-ts";
import {
  EmailString,
  FiscalCode,
  NonEmptyString
} from "italia-ts-commons/lib/strings";
import { BPDToken, MyPortalToken, SessionToken, WalletToken } from "./token";

// required attributes
export const UserWithoutTokens = t.intersection([
  t.interface({
    created_at: t.number,
    family_name: t.string,
    fiscal_code: FiscalCode,
    name: t.string,
    spid_level: t.unknown
  }),
  t.partial({
    date_of_birth: t.string,
    nameID: t.string,
    nameIDFormat: t.string,
    sessionIndex: t.string,
    session_tracking_id: t.string, // unique ID used for tracking in appinsights
    spid_email: EmailString,
    spid_idp: t.string,
    spid_mobile_phone: NonEmptyString
  })
]);
const RequiredUserTokensV1 = t.interface({
  session_token: SessionToken,
  wallet_token: WalletToken
});
export const UserV1 = t.intersection([UserWithoutTokens, RequiredUserTokensV1]);
export type UserV1 = t.TypeOf<typeof UserV1>;

const RequiredUserTokensV2 = t.intersection([
  RequiredUserTokensV1,
  t.interface({
    myportal_token: MyPortalToken
  })
]);
export const UserV2 = t.intersection([UserWithoutTokens, RequiredUserTokensV2]);
export type UserV2 = t.TypeOf<typeof UserV2>;

const RequiredUserTokensV3 = t.intersection([
  RequiredUserTokensV2,
  t.interface({
    bpd_token: BPDToken
  })
]);
export const UserV3 = t.intersection([UserWithoutTokens, RequiredUserTokensV3]);
export type UserV3 = t.TypeOf<typeof UserV3>;

export const User = t.union([UserV1, UserV2, UserV3], "User");
export type User = t.TypeOf<typeof User>;
