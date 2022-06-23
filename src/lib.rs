mod response;
mod utils;

use std::str::FromStr;

use near_contract_standards::fungible_token::core::ext_ft_core;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

use near_sdk::env::promise_result;
use near_sdk::json_types::U128;

use near_sdk::{env, ext_contract, near_bindgen, AccountId, PanicOnDefault, PromiseOrValue};

use near_contract_standards::fungible_token::metadata::FungibleTokenMetadata;

use response::MetadataTokens;
use utils::parse_promise_result;

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct Contract {
    contract_owner: AccountId,
    account_asset_a: AccountId,
    account_asset_b: AccountId,

    metadata_token_a: Option<FungibleTokenMetadata>,
    metadata_token_b: Option<FungibleTokenMetadata>,
}

#[ext_contract(ext_ft)]
pub trait FungibleToken {
    fn ft_balance_of(&mut self, account_id: AccountId) -> U128;

    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128>;

    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128>;

    fn ft_metadata(&self) -> FungibleTokenMetadata;
}

#[ext_contract(ext_self_metadata)]
pub trait MetadataReceiver {
    fn cb_initialization_metadata(&mut self) -> PromiseOrValue<U128>;
}

#[ext_contract(ext_self_tokens)]
pub trait TokenRelayer {
    fn cb_transfer_token(
        &self,
        counterparty: AccountId,
        token_received: AccountId,
        amount_received: U128,
    ) -> PromiseOrValue<U128>;
}

#[near_bindgen]
impl Contract {
    #[init]
    pub fn new(contract_owner: String, account_asset_a: String, account_asset_b: String) -> Self {
        ext_ft::ext(AccountId::from_str(&account_asset_a).unwrap())
            .ft_metadata()
            .and(ext_ft::ext(AccountId::from_str(&account_asset_a).unwrap()).ft_metadata())
            .then(ext_self_metadata::ext(env::current_account_id()).cb_initialization_metadata());

        Self {
            contract_owner: AccountId::from_str(&contract_owner).unwrap(),
            account_asset_a: AccountId::from_str(&account_asset_a).unwrap(),
            account_asset_b: AccountId::from_str(&account_asset_b).unwrap(),
            metadata_token_a: None,
            metadata_token_b: None,
        }
    }
}

#[near_bindgen]
impl Contract {
    /// Callback from new to parse tokens metadata and store them in state  
    #[private]
    pub fn cb_initialization_metadata(&mut self) {
        assert_eq!(env::promise_results_count(), 2, "INVALID_PROMISE_RESULTS");

        let metadata = parse_promise_result::<FungibleTokenMetadata>(&promise_result(0));
        if metadata.is_some() {
            self.metadata_token_a = metadata;
        } else {
            env::panic_str("Error when querying token A metadata.");
        }

        let metadata = parse_promise_result::<FungibleTokenMetadata>(&promise_result(1));
        if metadata.is_some() {
            self.metadata_token_b = metadata;
        } else {
            env::panic_str("Error when querying token B metadata.");
        }
    }

    pub fn ft_on_transfer(
        self,
        sender_id: AccountId,
        amount: U128,
        _msg: String,
    ) -> PromiseOrValue<U128> {
        if env::predecessor_account_id() != self.account_asset_a
            && env::predecessor_account_id() != self.account_asset_b
        {
            near_sdk::env::panic_str("Method can only be called by registered assets");
        }

        if sender_id == self.contract_owner {
            return PromiseOrValue::Value(U128(0));
        }

        let this_id = env::current_account_id();

        return ext_ft::ext(self.account_asset_a)
            .ft_balance_of(this_id.clone())
            .and(ext_ft::ext(self.account_asset_b).ft_balance_of(this_id))
            .then(
                ext_self_tokens::ext(env::current_account_id()).cb_transfer_token(
                    sender_id,
                    env::predecessor_account_id(),
                    amount,
                ),
            )
            .into();

        //return U128(0);
    }

    #[private]
    pub fn cb_transfer_token(
        self,
        counterparty: AccountId,
        token_received: AccountId,
        amount_received: U128,
    ) {
        let balance_token_a: u128 = parse_promise_result::<U128>(&promise_result(0))
            .unwrap()
            .into();
        let balance_token_b: u128 = parse_promise_result::<U128>(&promise_result(1))
            .unwrap()
            .into();

        let amount_received: u128 = amount_received.into();

        let acc_a = self.account_asset_a.clone();
        let acc_b = self.account_asset_b.clone();

        let previous_ratio = match token_received.clone() {
            acc_a => (balance_token_a - amount_received) * balance_token_b,
            acc_b => (balance_token_b - amount_received) * balance_token_a,
            _ => env::panic_str("Unsupported asset"),
        };

        match token_received {
            acc_a => {
                let to_send = balance_token_b - previous_ratio / balance_token_a;
                //ext_ft::ext(acc_b).ft_transfer(counterparty, U128(to_send));
                ext_ft_core::ext(acc_b).with_attached_deposit(1).ft_transfer(counterparty, U128(to_send), None);

            }
            acc_b => {
                let to_send = balance_token_a - previous_ratio / balance_token_b;
                //ext_ft::ext(acc_a).ft_transfer(counterparty, U128(to_send));
                ext_ft_core::ext(acc_a).with_attached_deposit(1).ft_transfer(counterparty, U128(to_send), None);

            }
            _ => env::panic_str("Unsupported asset"),
        }
    }

    #[result_serializer(borsh)]
    pub fn metadata_tokens(self) -> MetadataTokens {
        return MetadataTokens {
            metadata_token_a: self.metadata_token_a.unwrap(),
            metadata_token_b: self.metadata_token_b.unwrap(),
        };
    }
}
