# Two-Tokens AMM   

Implementing a simple 2 tokens AMM for Near in Rust. 
AMM follows the X * Y = K formula for pricing.  

This is an assignement and is subject to additional constraints.  
Most notably, the constant K in the X * Y = K can be modified by the owner of the contract by depositing tokens on the contract.   

WARNING:    
Code currently does not work. Transfers from AMM to user fail with "required deposit of 1 yoctonear" error. I did attach a deposit of 1 yoctonear in contract so I'm currently unsure why the error happens.  

## Implementation  

Cross-contract calls in Near follow an Actor model and use callbacks even for simple view functions.    

The canonical token Fungible Token implementation features allowances and callbacks to the beneficiary of a token transfer.  
This means we technically have 2 ways to implement the AMM swap mechanism:  
    - AMM contract is the one initiating all transfers between accounts.  
This implementation requires the sender to have given approval to the contract to perform transfers from his account (i.e. "user.near" wants to swap token A to token B. 
He'll need to have set an allowance on the token A contract for the swap contract to perform transactions using funds of "user.near").   
    - User performs transfer directly on the token contract with the swap contract as beneficiary using the transfer_call method.  
The transfer_call method allows calling the ft_on_transfer callback on the beneficary, which is then used to perform the second leg of the swap.  

We use the second model. 

## Fungible Token  
The contract for the Fungible Tokens comes from the near-examples github: https://github.com/near-examples/FT  
Methods and inner working are explained here: https://docs.near.org/docs/roles/integrator/fungible-tokens  

## Build Contracts  
Run "cargo build --target wasm32-unknown-unknown --release" to compile the contract to a WASM blob.  
See the docs https://docs.near.org/docs/develop/contracts/rust/intro   

## Testing  
Testing is done using the Near Sandbox  

The install guide and example usage is given here: https://docs.near.org/docs/develop/contracts/sandbox  

You'll also need to run npm install to get dependencies. 

Once you have the sandbox running, you can run tests using "npm run test".  
This will create accounts on the sandbox, deploy tokens and amm contracts, initialize the contracts, distribute tokens to users and run token transfers through the AMM.  

Binaries are put in the sandbox-test/res folder.



