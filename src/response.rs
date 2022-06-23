use near_contract_standards::fungible_token::metadata::FungibleTokenMetadata;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};

#[derive(BorshDeserialize, BorshSerialize)]
pub struct MetadataTokens {
    pub metadata_token_a: FungibleTokenMetadata,
    pub metadata_token_b: FungibleTokenMetadata,
}
