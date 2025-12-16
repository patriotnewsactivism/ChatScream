import { CreateDemoUserData, ListStreamsData, CreateDonationData, CreateDonationVariables, GetMyDonationGoalsData } from '../';
import { UseDataConnectQueryResult, useDataConnectQueryOptions, UseDataConnectMutationResult, useDataConnectMutationOptions} from '@tanstack-query-firebase/react/data-connect';
import { UseQueryResult, UseMutationResult} from '@tanstack/react-query';
import { DataConnect } from 'firebase/data-connect';
import { FirebaseError } from 'firebase/app';


export function useCreateDemoUser(options?: useDataConnectMutationOptions<CreateDemoUserData, FirebaseError, void>): UseDataConnectMutationResult<CreateDemoUserData, undefined>;
export function useCreateDemoUser(dc: DataConnect, options?: useDataConnectMutationOptions<CreateDemoUserData, FirebaseError, void>): UseDataConnectMutationResult<CreateDemoUserData, undefined>;

export function useListStreams(options?: useDataConnectQueryOptions<ListStreamsData>): UseDataConnectQueryResult<ListStreamsData, undefined>;
export function useListStreams(dc: DataConnect, options?: useDataConnectQueryOptions<ListStreamsData>): UseDataConnectQueryResult<ListStreamsData, undefined>;

export function useCreateDonation(options?: useDataConnectMutationOptions<CreateDonationData, FirebaseError, CreateDonationVariables>): UseDataConnectMutationResult<CreateDonationData, CreateDonationVariables>;
export function useCreateDonation(dc: DataConnect, options?: useDataConnectMutationOptions<CreateDonationData, FirebaseError, CreateDonationVariables>): UseDataConnectMutationResult<CreateDonationData, CreateDonationVariables>;

export function useGetMyDonationGoals(options?: useDataConnectQueryOptions<GetMyDonationGoalsData>): UseDataConnectQueryResult<GetMyDonationGoalsData, undefined>;
export function useGetMyDonationGoals(dc: DataConnect, options?: useDataConnectQueryOptions<GetMyDonationGoalsData>): UseDataConnectQueryResult<GetMyDonationGoalsData, undefined>;
