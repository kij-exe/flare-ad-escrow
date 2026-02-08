# Wagmi v2 Hooks — Full API Reference

## useAccount

```tsx
import { useAccount } from "wagmi";
const account = useAccount();
```

**Parameters:** `config?` (Config)

**Return Type (`UseAccountReturnType`):**

| Field            | Type                                                              | Description                                  |
| ---------------- | ----------------------------------------------------------------- | -------------------------------------------- |
| `address`        | `Address \| undefined`                                            | Connected address (first from `addresses`)   |
| `addresses`      | `readonly Address[] \| undefined`                                 | All connected addresses                      |
| `chain`          | `Chain \| undefined`                                              | Connected chain (undefined if not in config) |
| `chainId`        | `number \| undefined`                                             | Connected chain ID                           |
| `connector`      | `Connector \| undefined`                                          | Connected connector                          |
| `status`         | `'connecting' \| 'reconnecting' \| 'connected' \| 'disconnected'` | Connection status                            |
| `isConnecting`   | `boolean`                                                         | Derived from status                          |
| `isReconnecting` | `boolean`                                                         | Derived from status                          |
| `isConnected`    | `boolean`                                                         | Derived from status                          |
| `isDisconnected` | `boolean`                                                         | Derived from status                          |

**Type narrowing:** When `status === 'connected'`, `address` is guaranteed defined.

---

## useAccountEffect

```tsx
import { useAccountEffect } from "wagmi";
useAccountEffect({
    onConnect(data) {
        /* { address, addresses, chain, chainId, connector, isReconnected } */
    },
    onDisconnect() {
        /* no args */
    },
});
```

Fires callbacks on account connect/disconnect lifecycle events.

---

## useReadContract

```tsx
import { useReadContract } from "wagmi";
```

**Parameters (`UseReadContractParameters`):**

| Param          | Type                                                           | Required       | Description                       |
| -------------- | -------------------------------------------------------------- | -------------- | --------------------------------- |
| `abi`          | `Abi`                                                          | Yes            | Contract ABI                      |
| `address`      | `Address`                                                      | Yes            | Contract address                  |
| `functionName` | `string`                                                       | Yes            | Function name (inferred from ABI) |
| `args`         | `readonly unknown[]`                                           | If fn has args | Arguments (inferred from ABI)     |
| `account`      | `Account`                                                      | No             | msg.sender override               |
| `blockNumber`  | `bigint`                                                       | No             | Read at specific block            |
| `blockTag`     | `'latest' \| 'earliest' \| 'pending' \| 'safe' \| 'finalized'` | No             | Read at block tag                 |
| `chainId`      | `number`                                                       | No             | Force specific chain              |
| `config`       | `Config`                                                       | No             | Override config                   |
| `scopeKey`     | `string`                                                       | No             | Cache scope key                   |
| `query`        | TanStack Query options                                         | No             | See below                         |

**Supported `query` options:** `enabled`, `gcTime`, `initialData`, `placeholderData`, `refetchInterval`, `refetchOnMount`, `refetchOnReconnect`, `refetchOnWindowFocus`, `retry`, `retryDelay`, `select`, `staleTime`, `structuralSharing`.

**Return Type (`UseReadContractReturnType`):**

| Field           | Type                                  | Description                                       |
| --------------- | ------------------------------------- | ------------------------------------------------- |
| `data`          | `ReadContractReturnType \| undefined` | Resolved data (type-inferred from ABI)            |
| `error`         | `ReadContractErrorType \| null`       | Error if thrown                                   |
| `status`        | `'pending' \| 'error' \| 'success'`   | Query status                                      |
| `isPending`     | `boolean`                             | No cached data, no finished attempt               |
| `isError`       | `boolean`                             | Query errored                                     |
| `isSuccess`     | `boolean`                             | Data ready                                        |
| `isLoading`     | `boolean`                             | First fetch in-flight (`isFetching && isPending`) |
| `isFetching`    | `boolean`                             | Any fetch in-flight (includes background refetch) |
| `isRefetching`  | `boolean`                             | Background refetch (`isFetching && !isPending`)   |
| `refetch`       | `(opts?) => Promise<...>`             | Manually refetch                                  |
| `fetchStatus`   | `'fetching' \| 'idle' \| 'paused'`    | Fetch status                                      |
| `dataUpdatedAt` | `number`                              | Timestamp of last success                         |

---

## useReadContracts

```tsx
import { useReadContracts } from "wagmi";
```

**Parameters (`UseReadContractsParameters`):**

| Param              | Type                   | Required | Description                                                    |
| ------------------ | ---------------------- | -------- | -------------------------------------------------------------- |
| `contracts`        | `Contract[]`           | Yes      | Array of `{ abi, address, functionName, args?, chainId? }`     |
| `allowFailure`     | `boolean`              | No       | Default `true`. If true, individual failures don't break batch |
| `batchSize`        | `number`               | No       | Max calldata bytes per chunk. Default `1024`.`0`= no limit     |
| `blockNumber`      | `bigint`               | No       | Read at specific block                                         |
| `blockTag`         | `string`               | No       | Read at block tag                                              |
| `multicallAddress` | `Address`              | No       | Custom multicall contract                                      |
| `query`            | TanStack Query options | No       | Same options as useReadContract                                |

**Return data shape:** `data` is an array where each element is `{ result, error, status }`.

- When `allowFailure: true` (default): `result` may be undefined if that call failed
- When `allowFailure: false`: entire query fails if any call reverts

---

## useWriteContract

```tsx
import { useWriteContract } from "wagmi";
const { writeContract, writeContractAsync, data: hash, isPending, error, reset } = useWriteContract();
```

**Hook parameters:** `config?`, `mutation?` (TanStack mutation options: `onSuccess`, `onError`, `onSettled`, `onMutate`, `retry`, `retryDelay`, `gcTime`).

**`writeContract` / `writeContractAsync` variables:**

| Param          | Type                 | Required       | Description                     |
| -------------- | -------------------- | -------------- | ------------------------------- |
| `abi`          | `Abi`                | Yes            | Contract ABI                    |
| `address`      | `Address`            | Yes            | Contract address                |
| `functionName` | `string`             | Yes            | Function name                   |
| `args`         | `readonly unknown[]` | If fn has args | Arguments                       |
| `value`        | `bigint`             | No             | ETH value for payable functions |

**`writeContract`** — fire-and-forget, returns `void`. Use callbacks for side effects.
**`writeContractAsync`** — returns `Promise<`0x${string}`>` (the tx hash). Use with `await`.

Both accept inline `{ onSuccess, onError, onSettled }` callbacks.

**Return Type (`UseWriteContractReturnType`):**

| Field       | Type                                  | Description          |
| ----------- | ------------------------------------- | -------------------- |
| `data`      | ``0x${string}` \| undefined`          | Transaction hash     |
| `error`     | `WriteContractErrorType \| null`      | Error                |
| `isPending` | `boolean`                             | Mutation executing   |
| `isIdle`    | `boolean`                             | Before first call    |
| `isSuccess` | `boolean`                             | Last call succeeded  |
| `isError`   | `boolean`                             | Last call errored    |
| `reset`     | `() => void`                          | Reset mutation state |
| `variables` | `WriteContractVariables \| undefined` | Last call variables  |

---

## useWaitForTransactionReceipt

```tsx
import { useWaitForTransactionReceipt } from "wagmi";
const { data: receipt, isLoading, isSuccess } = useWaitForTransactionReceipt({ hash });
```

**Parameters:**

| Param             | Type                         | Required | Description                                 |
| ----------------- | ---------------------------- | -------- | ------------------------------------------- |
| `hash`            | ``0x${string}` \| undefined` | Yes      | Tx hash. Query auto-disabled when undefined |
| `chainId`         | `number`                     | No       | Chain to query                              |
| `confirmations`   | `number`                     | No       | Blocks to wait for                          |
| `pollingInterval` | `number`                     | No       | Poll frequency in ms                        |
| `onReplaced`      | `(replacement) => void`      | No       | Callback for sped-up/cancelled txs          |
| `query`           | TanStack Query options       | No       | Same as useReadContract                     |

**Return Type:** Same query shape as `useReadContract`, where `data` is the `TransactionReceipt`.

---

## useSwitchChain

```tsx
import { useSwitchChain } from "wagmi";
const { chains, switchChain, switchChainAsync, isPending } = useSwitchChain();
```

**`switchChain({ chainId })`** — fire-and-forget.
**`switchChainAsync({ chainId })`** — returns `Promise<Chain>`.

**Return Type:**

| Field              | Type                                   | Description           |
| ------------------ | -------------------------------------- | --------------------- |
| `chains`           | `readonly Chain[]`                     | All configured chains |
| `switchChain`      | `(vars, callbacks?) => void`           | Switch chain          |
| `switchChainAsync` | `(vars, callbacks?) => Promise<Chain>` | Async switch          |
| `data`             | `Chain \| undefined`                   | Last switched chain   |
| `isPending`        | `boolean`                              | Switch in progress    |
| `isError`          | `boolean`                              | Switch failed         |
| `error`            | `SwitchChainErrorType \| null`         | Error                 |

**Tip:** When connected, switches the connector's chain. When disconnected, switches the Config's target chain.

---

## createConfig

```tsx
import { createConfig, http } from "wagmi";
```

**Parameters (`CreateConfigParameters`):**

| Param                            | Type                                          | Required | Description                                             |
| -------------------------------- | --------------------------------------------- | -------- | ------------------------------------------------------- |
| `chains`                         | `readonly [Chain, ...Chain[]]`                | Yes      | Chains to support                                       |
| `transports`                     | `Record<chainId, Transport>`                  | Yes\*    | Transport per chain                                     |
| `client`                         | `({ chain }) => Client`                       | Yes\*    | Alternative to transports for custom viem Client        |
| `connectors`                     | `CreateConnectorFn[]`                         | No       | Manual connectors (injected auto-discovered by default) |
| `ssr`                            | `boolean`                                     | No       | SSR mode. Default `false`. Set `true`for Next.js        |
| `storage`                        | `Storage \| null`                             | No       | State persistence. Default `localStorage`               |
| `multiInjectedProviderDiscovery` | `boolean`                                     | No       | EIP-6963 discovery. Default `true`                      |
| `syncConnectedChain`             | `boolean`                                     | No       | Sync chainId with connection. Default `true`            |
| `batch`                          | `{ multicall?: boolean \| MulticallOptions }` | No       | Batch settings. Default `{ multicall: true }`           |
| `pollingInterval`                | `number`                                      | No       | Poll frequency in ms. Default `4000`                    |

\*Provide either `transports` or `client`, not both.

---

## WagmiProvider

```tsx
<WagmiProvider config={config} initialState={/* SSR state */} reconnectOnMount={true}>
    {children}
</WagmiProvider>
```

| Prop               | Type                 | Description                        |
| ------------------ | -------------------- | ---------------------------------- |
| `config`           | `Config`             | Required. The wagmi config object  |
| `initialState`     | `State \| undefined` | SSR hydration state                |
| `reconnectOnMount` | `boolean`            | Reconnect on mount. Default `true` |
