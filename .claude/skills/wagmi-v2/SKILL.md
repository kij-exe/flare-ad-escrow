---
## name: wagmi-v2
description: >
Use when writing React frontend code that interacts with Ethereum/EVM smart contracts.
Covers wallet connection, reading contracts, writing contracts, transaction receipts,
and chain switching. ALWAYS use wagmi v2 hooks (useReadContract, useWriteContract) —
NEVER use wagmi v1 hooks (useContractRead, useContractWrite, usePrepareContractWrite).
Auto-invoke when user mentions wagmi, wallet connection, useReadContract, useWriteContract,
contract interaction in React, or frontend blockchain integration.


# Wagmi v2 React Hooks Skill


## ⚠️ CRITICAL: This is Wagmi v2, NOT v1


Do NOT use any v1 hooks. They will not work:


| ❌ v1 (WRONG)                 | ✅ v2 (CORRECT)                                |
| ------------------------------- | ------------------------------------------------ |
| `useContractRead`         | `useReadContract`                          |
| `useContractReads`        | `useReadContracts`                         |
| `useContractWrite`        | `useWriteContract`                         |
| `usePrepareContractWrite` | REMOVED — no longer needed                    |
| `useNetwork`              | `useAccount`(has`chain`,`chainId`) |
| `useSwitchNetwork`        | `useSwitchChain`                           |
| `useWaitForTransaction`   | `useWaitForTransactionReceipt`             |


## Required Dependencies


```bash
npm install wagmi viem@2.x @tanstack/react-query
```


## App Setup (Required Providers)


```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { config } from './config'

const queryClient = new QueryClient()

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {/* All components using wagmi hooks must be inside these providers */}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
```


## Config Setup (createConfig)


```tsx
import { createConfig, http } from 'wagmi'

// Define custom chain if not built-in (e.g. Coston2)
const myChain = {
  id: 114,
  name: 'Coston2',
  nativeCurrency: { name: 'Coston2 Flare', symbol: 'C2FLR', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://coston2-api.flare.network/ext/C/rpc'] },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://coston2-explorer.flare.network' },
  },
} as const

export const config = createConfig({
  chains: [myChain],
  transports: {
    [myChain.id]: http(),
  },
})
```


Key `createConfig` options:


* `chains` — Array of chain objects (required)
* `transports` — Mapping of chain ID → transport (required, unless using `client`)
* `connectors` — Array of connector functions (optional, auto-discovers injected wallets by default)
* `ssr: true` — Set for Next.js / SSR environments
* `storage` — Defaults to localStorage, use `createStorage()` for custom


## Core Hooks Quick Reference


### useAccount — Get connected wallet info


```tsx
import { useAccount } from 'wagmi'

const { address, isConnected, isDisconnected, chain, chainId, connector, status } = useAccount()

// status: 'connecting' | 'reconnecting' | 'connected' | 'disconnected'
// When status === 'connected', address is guaranteed defined
```


### useReadContract — Read a single view/pure function


```tsx
import { useReadContract } from 'wagmi'

const { data, isLoading, isError, error, refetch } = useReadContract({
  address: '0x...',
  abi: myContractABI,
  functionName: 'balanceOf',
  args: ['0x...'],
  // Optional:
  // chainId: 114,
  // query: { enabled: !!address, refetchInterval: 5000 }
})
```


Key points:


* Returns TanStack Query result — use `data`, `isLoading`, `isError`, `isPending`
* `data` type is inferred from ABI + functionName
* Disable with `query: { enabled: false }` for conditional fetching
* `args` must match the function signature from ABI


### useReadContracts — Batch multiple reads (multicall)


```tsx
import { useReadContracts } from 'wagmi'

const contractConfig = {
  address: '0x...',
  abi: myContractABI,
} as const

const { data } = useReadContracts({
  contracts: [
    { ...contractConfig, functionName: 'deals', args: [dealId] },
    { ...contractConfig, functionName: 'milestones', args: [dealId, 0n] },
    { ...otherContract, functionName: 'balanceOf', args: [address] },
  ],
})

// data is an array of results: data[0].result, data[1].result, etc.
// Each item has: { result, error, status: 'success' | 'failure' }
```


Key points:


* Single RPC call via multicall — more efficient than multiple useReadContract
* `allowFailure` defaults to `true` — individual calls can fail without breaking others
* Each result has its own `status` and `error`


### useWriteContract — Execute a state-changing function


```tsx
import { useWriteContract } from 'wagmi'

const { writeContract, writeContractAsync, data: hash, isPending, isError, error } = useWriteContract()

// Fire and forget:
writeContract({
  address: '0x...',
  abi: myContractABI,
  functionName: 'createOrder',
  args: [param1, param2],
  // value: parseEther('0.1'), // for payable functions
})

// Await the tx hash:
const hash = await writeContractAsync({
  address: '0x...',
  abi: myContractABI,
  functionName: 'createOrder',
  args: [param1, param2],
})
```


Key points:


* `writeContract` — fire-and-forget, use callbacks (`onSuccess`, `onError`)
* `writeContractAsync` — returns Promise with tx hash, use in async flows
* `data` (the hash) is `undefined` until mutation completes
* `isPending` is true while wallet confirmation is open
* No `usePrepareContractWrite` needed — that's v1


### useWaitForTransactionReceipt — Wait for tx confirmation


```tsx
import { useWaitForTransactionReceipt } from 'wagmi'

const { data: receipt, isLoading: isConfirming, isSuccess: isConfirmed } =
  useWaitForTransactionReceipt({
    hash: txHash, // from useWriteContract's data
    // confirmations: 1,
  })
```


Key points:


* Pass `hash` from `useWriteContract`
* Auto-disabled when `hash` is `undefined`
* `receipt` contains: `status`, `blockNumber`, `gasUsed`, `logs`, etc.


### Common Write + Wait Pattern


```tsx
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'

function CreateOrder() {
  const { writeContract, data: hash, isPending } = useWriteContract()

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash })

  const handleSubmit = () => {
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: contractABI,
      functionName: 'createOrder',
      args: [title, amount],
    })
  }

  return (
    <div>
      <button onClick={handleSubmit} disabled={isPending}>
        {isPending ? 'Confirm in wallet...' : 'Create Order'}
      </button>
      {isConfirming && <p>Waiting for confirmation...</p>}
      {isConfirmed && <p>Order created!</p>}
    </div>
  )
}
```


### useSwitchChain — Switch to a different chain


```tsx
import { useSwitchChain } from 'wagmi'

const { chains, switchChain, switchChainAsync } = useSwitchChain()

// Switch (fire and forget):
switchChain({ chainId: 114 })

// Switch (async):
await switchChainAsync({ chainId: 114 })

// Render chain list:
chains.map(chain => (
  <button key={chain.id} onClick={() => switchChain({ chainId: chain.id })}>
    {chain.name}
  </button>
))
```


### useAccountEffect — Listen to connect/disconnect events


```tsx
import { useAccountEffect } from 'wagmi'

useAccountEffect({
  onConnect({ address, chain, chainId, connector, isReconnected }) {
    console.log('Connected!', address)
  },
  onDisconnect() {
    console.log('Disconnected!')
  },
})
```


## ERC20 Approve + Contract Write Pattern


Common for token-gated actions (e.g. depositing stablecoins):


```tsx
const { writeContractAsync } = useWriteContract()

async function approveAndDeposit(amount: bigint) {
  // Step 1: Approve token spending
  const approveTx = await writeContractAsync({
    address: TOKEN_ADDRESS,
    abi: erc20ABI,
    functionName: 'approve',
    args: [SPENDER_ADDRESS, amount],
  })

  // Step 2: Wait for approval confirmation
  // (use useWaitForTransactionReceipt or poll)

  // Step 3: Execute the deposit
  const depositTx = await writeContractAsync({
    address: CONTRACT_ADDRESS,
    abi: contractABI,
    functionName: 'deposit',
    args: [amount],
  })
}
```


## Reference Files


For full parameter and return type details, see:


* `references/read-hooks.md` — Complete useReadContract and useReadContracts API
* `references/write-hooks.md` — Complete useWriteContract and useWaitForTransactionReceipt API
* `references/config-and-account.md` — createConfig, useAccount, useSwitchChain, WagmiProvider API
---
