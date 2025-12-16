# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `example`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

**If you're looking for the `React README`, you can find it at [`dataconnect-generated/react/README.md`](./react/README.md)**

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*ListStreams*](#liststreams)
  - [*GetMyDonationGoals*](#getmydonationgoals)
- [**Mutations**](#mutations)
  - [*CreateDemoUser*](#createdemouser)
  - [*CreateDonation*](#createdonation)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `example`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@dataconnect/generated` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## ListStreams
You can execute the `ListStreams` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
listStreams(): QueryPromise<ListStreamsData, undefined>;

interface ListStreamsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListStreamsData, undefined>;
}
export const listStreamsRef: ListStreamsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
listStreams(dc: DataConnect): QueryPromise<ListStreamsData, undefined>;

interface ListStreamsRef {
  ...
  (dc: DataConnect): QueryRef<ListStreamsData, undefined>;
}
export const listStreamsRef: ListStreamsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the listStreamsRef:
```typescript
const name = listStreamsRef.operationName;
console.log(name);
```

### Variables
The `ListStreams` query has no variables.
### Return Type
Recall that executing the `ListStreams` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ListStreamsData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface ListStreamsData {
  streams: ({
    id: UUIDString;
    title: string;
    streamUrl: string;
    startTime: TimestampString;
    isLive?: boolean | null;
  } & Stream_Key)[];
}
```
### Using `ListStreams`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, listStreams } from '@dataconnect/generated';


// Call the `listStreams()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await listStreams();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await listStreams(dataConnect);

console.log(data.streams);

// Or, you can use the `Promise` API.
listStreams().then((response) => {
  const data = response.data;
  console.log(data.streams);
});
```

### Using `ListStreams`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, listStreamsRef } from '@dataconnect/generated';


// Call the `listStreamsRef()` function to get a reference to the query.
const ref = listStreamsRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = listStreamsRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.streams);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.streams);
});
```

## GetMyDonationGoals
You can execute the `GetMyDonationGoals` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getMyDonationGoals(): QueryPromise<GetMyDonationGoalsData, undefined>;

interface GetMyDonationGoalsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetMyDonationGoalsData, undefined>;
}
export const getMyDonationGoalsRef: GetMyDonationGoalsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getMyDonationGoals(dc: DataConnect): QueryPromise<GetMyDonationGoalsData, undefined>;

interface GetMyDonationGoalsRef {
  ...
  (dc: DataConnect): QueryRef<GetMyDonationGoalsData, undefined>;
}
export const getMyDonationGoalsRef: GetMyDonationGoalsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getMyDonationGoalsRef:
```typescript
const name = getMyDonationGoalsRef.operationName;
console.log(name);
```

### Variables
The `GetMyDonationGoals` query has no variables.
### Return Type
Recall that executing the `GetMyDonationGoals` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetMyDonationGoalsData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface GetMyDonationGoalsData {
  donationGoals: ({
    id: UUIDString;
    description: string;
    goalAmount: number;
    currentAmount?: number | null;
    achievedAt?: TimestampString | null;
  } & DonationGoal_Key)[];
}
```
### Using `GetMyDonationGoals`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getMyDonationGoals } from '@dataconnect/generated';


// Call the `getMyDonationGoals()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getMyDonationGoals();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getMyDonationGoals(dataConnect);

console.log(data.donationGoals);

// Or, you can use the `Promise` API.
getMyDonationGoals().then((response) => {
  const data = response.data;
  console.log(data.donationGoals);
});
```

### Using `GetMyDonationGoals`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getMyDonationGoalsRef } from '@dataconnect/generated';


// Call the `getMyDonationGoalsRef()` function to get a reference to the query.
const ref = getMyDonationGoalsRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getMyDonationGoalsRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.donationGoals);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.donationGoals);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## CreateDemoUser
You can execute the `CreateDemoUser` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
createDemoUser(): MutationPromise<CreateDemoUserData, undefined>;

interface CreateDemoUserRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): MutationRef<CreateDemoUserData, undefined>;
}
export const createDemoUserRef: CreateDemoUserRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
createDemoUser(dc: DataConnect): MutationPromise<CreateDemoUserData, undefined>;

interface CreateDemoUserRef {
  ...
  (dc: DataConnect): MutationRef<CreateDemoUserData, undefined>;
}
export const createDemoUserRef: CreateDemoUserRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the createDemoUserRef:
```typescript
const name = createDemoUserRef.operationName;
console.log(name);
```

### Variables
The `CreateDemoUser` mutation has no variables.
### Return Type
Recall that executing the `CreateDemoUser` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CreateDemoUserData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CreateDemoUserData {
  user_insert: User_Key;
}
```
### Using `CreateDemoUser`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, createDemoUser } from '@dataconnect/generated';


// Call the `createDemoUser()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createDemoUser();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await createDemoUser(dataConnect);

console.log(data.user_insert);

// Or, you can use the `Promise` API.
createDemoUser().then((response) => {
  const data = response.data;
  console.log(data.user_insert);
});
```

### Using `CreateDemoUser`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, createDemoUserRef } from '@dataconnect/generated';


// Call the `createDemoUserRef()` function to get a reference to the mutation.
const ref = createDemoUserRef();

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = createDemoUserRef(dataConnect);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.user_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.user_insert);
});
```

## CreateDonation
You can execute the `CreateDonation` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
createDonation(vars: CreateDonationVariables): MutationPromise<CreateDonationData, CreateDonationVariables>;

interface CreateDonationRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateDonationVariables): MutationRef<CreateDonationData, CreateDonationVariables>;
}
export const createDonationRef: CreateDonationRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
createDonation(dc: DataConnect, vars: CreateDonationVariables): MutationPromise<CreateDonationData, CreateDonationVariables>;

interface CreateDonationRef {
  ...
  (dc: DataConnect, vars: CreateDonationVariables): MutationRef<CreateDonationData, CreateDonationVariables>;
}
export const createDonationRef: CreateDonationRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the createDonationRef:
```typescript
const name = createDonationRef.operationName;
console.log(name);
```

### Variables
The `CreateDonation` mutation requires an argument of type `CreateDonationVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface CreateDonationVariables {
  streamId: UUIDString;
  amount: number;
  currency: string;
  donorUsername?: string | null;
  message?: string | null;
}
```
### Return Type
Recall that executing the `CreateDonation` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CreateDonationData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CreateDonationData {
  donation_insert: Donation_Key;
}
```
### Using `CreateDonation`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, createDonation, CreateDonationVariables } from '@dataconnect/generated';

// The `CreateDonation` mutation requires an argument of type `CreateDonationVariables`:
const createDonationVars: CreateDonationVariables = {
  streamId: ..., 
  amount: ..., 
  currency: ..., 
  donorUsername: ..., // optional
  message: ..., // optional
};

// Call the `createDonation()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createDonation(createDonationVars);
// Variables can be defined inline as well.
const { data } = await createDonation({ streamId: ..., amount: ..., currency: ..., donorUsername: ..., message: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await createDonation(dataConnect, createDonationVars);

console.log(data.donation_insert);

// Or, you can use the `Promise` API.
createDonation(createDonationVars).then((response) => {
  const data = response.data;
  console.log(data.donation_insert);
});
```

### Using `CreateDonation`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, createDonationRef, CreateDonationVariables } from '@dataconnect/generated';

// The `CreateDonation` mutation requires an argument of type `CreateDonationVariables`:
const createDonationVars: CreateDonationVariables = {
  streamId: ..., 
  amount: ..., 
  currency: ..., 
  donorUsername: ..., // optional
  message: ..., // optional
};

// Call the `createDonationRef()` function to get a reference to the mutation.
const ref = createDonationRef(createDonationVars);
// Variables can be defined inline as well.
const ref = createDonationRef({ streamId: ..., amount: ..., currency: ..., donorUsername: ..., message: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = createDonationRef(dataConnect, createDonationVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.donation_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.donation_insert);
});
```

