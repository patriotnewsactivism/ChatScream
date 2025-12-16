import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, MutationRef, MutationPromise } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface CreateDemoUserData {
  user_insert: User_Key;
}

export interface CreateDonationData {
  donation_insert: Donation_Key;
}

export interface CreateDonationVariables {
  streamId: UUIDString;
  amount: number;
  currency: string;
  donorUsername?: string | null;
  message?: string | null;
}

export interface DonationGoal_Key {
  id: UUIDString;
  __typename?: 'DonationGoal_Key';
}

export interface Donation_Key {
  id: UUIDString;
  __typename?: 'Donation_Key';
}

export interface GetMyDonationGoalsData {
  donationGoals: ({
    id: UUIDString;
    description: string;
    goalAmount: number;
    currentAmount?: number | null;
    achievedAt?: TimestampString | null;
  } & DonationGoal_Key)[];
}

export interface ListStreamsData {
  streams: ({
    id: UUIDString;
    title: string;
    streamUrl: string;
    startTime: TimestampString;
    isLive?: boolean | null;
  } & Stream_Key)[];
}

export interface Stream_Key {
  id: UUIDString;
  __typename?: 'Stream_Key';
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

interface CreateDemoUserRef {
  /* Allow users to create refs without passing in DataConnect */
  (): MutationRef<CreateDemoUserData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): MutationRef<CreateDemoUserData, undefined>;
  operationName: string;
}
export const createDemoUserRef: CreateDemoUserRef;

export function createDemoUser(): MutationPromise<CreateDemoUserData, undefined>;
export function createDemoUser(dc: DataConnect): MutationPromise<CreateDemoUserData, undefined>;

interface ListStreamsRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListStreamsData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<ListStreamsData, undefined>;
  operationName: string;
}
export const listStreamsRef: ListStreamsRef;

export function listStreams(): QueryPromise<ListStreamsData, undefined>;
export function listStreams(dc: DataConnect): QueryPromise<ListStreamsData, undefined>;

interface CreateDonationRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateDonationVariables): MutationRef<CreateDonationData, CreateDonationVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateDonationVariables): MutationRef<CreateDonationData, CreateDonationVariables>;
  operationName: string;
}
export const createDonationRef: CreateDonationRef;

export function createDonation(vars: CreateDonationVariables): MutationPromise<CreateDonationData, CreateDonationVariables>;
export function createDonation(dc: DataConnect, vars: CreateDonationVariables): MutationPromise<CreateDonationData, CreateDonationVariables>;

interface GetMyDonationGoalsRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetMyDonationGoalsData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<GetMyDonationGoalsData, undefined>;
  operationName: string;
}
export const getMyDonationGoalsRef: GetMyDonationGoalsRef;

export function getMyDonationGoals(): QueryPromise<GetMyDonationGoalsData, undefined>;
export function getMyDonationGoals(dc: DataConnect): QueryPromise<GetMyDonationGoalsData, undefined>;

