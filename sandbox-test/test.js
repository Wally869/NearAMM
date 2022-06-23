const nearAPI = require("near-api-js");
const BN = require("bn.js");
const fs = require("fs").promises;
const assert = require("assert").strict;


function getConfig(env) {
    switch (env) {
        case "sandbox":
        case "local":
            return {
                networkId: "sandbox",
                nodeUrl: "http://localhost:3030",
                masterAccount: "test.near",
                ammAccount: "amm.test.near",
                aTokenAccount: "token-a.test.near",
                bTokenAccount: "token-b.test.near",
                keyPath: "/tmp/near-sandbox/validator_key.json",
                adminAccount: "admin.test.near",
                userAccounts: [
                    "alice.test.near",
                    "bob.test.near",
                ]
            };
    }
}

const contractMethods = {
    viewMethods: ["get_status"],
    changeMethods: ["set_status"],
};

const ammMethods = {
    viewMethods: [],
    changeMethods: ["swap", "deposit", "new"]
}

const ftMethods = {
    viewMethods: ["ft_metadata", "ft_balance_of"],
    changeMethods: ["storage_deposit", "new", "ft_transfer", "ft_transfer_call"],
}


let config;
let masterAccount;
let masterKey;
let pubKey;
let keyStore;
let near;

let accounts = {};


async function initNear() {
    config = getConfig(process.env.NEAR_ENV || "sandbox");
    const keyFile = require(config.keyPath);
    masterKey = nearAPI.utils.KeyPair.fromString(
        keyFile.secret_key || keyFile.private_key
    );
    pubKey = masterKey.getPublicKey();
    keyStore = new nearAPI.keyStores.InMemoryKeyStore();
    keyStore.setKey(config.networkId, config.masterAccount, masterKey);
    near = await nearAPI.connect({
        deps: {
            keyStore,
        },
        networkId: config.networkId,
        nodeUrl: config.nodeUrl,
    });
    masterAccount = new nearAPI.Account(near.connection, config.masterAccount);
}

async function createContractUser(
    accountPrefix,
    contractAccountId,
    contractMethods
) {
    let accountId = accountPrefix + "." + config.masterAccount;
    await masterAccount.createAccount(
        accountId,
        pubKey,
        new BN(10).pow(new BN(25))
    );
    keyStore.setKey(config.networkId, accountId, masterKey);
    const account = new nearAPI.Account(near.connection, accountId);
    const accountUseContract = new nearAPI.Contract(
        account,
        contractAccountId,
        contractMethods
    );
    return accountUseContract;
}

async function createTokens(config) {
    const contract = await fs.readFile("sandbox-test/res/fungible_token.wasm");

    _ = await masterAccount.createAndDeployContract(
        config.aTokenAccount,
        pubKey,
        contract,
        new BN(10).pow(new BN(25))
    );

    _ = await masterAccount.createAndDeployContract(
        config.bTokenAccount,
        pubKey,
        contract,
        new BN(10).pow(new BN(25))
    );


}

async function initTest() {
    const contract = await fs.readFile("sandbox-test/res/amm.wasm");
    const ammContractAccount = await masterAccount.createAndDeployContract(
        config.ammAccount,
        pubKey,
        contract,
        new BN(10).pow(new BN(25))
    );

    const aliceUseContract = await createContractUser(
        "alice",
        config.ammAccount,
        contractMethods
    );

    const bobUseContract = await createContractUser(
        "bob",
        config.ammAccount,
        contractMethods
    );

    return { aliceUseContract, bobUseContract };
}

// user: alice.test.near 
// storage deposit value for fungible token: 1250000000000000000000
async function createAccountTokens(user) {
    const account = new nearAPI.Account(near.connection, user);

    let accountUseContract = new nearAPI.Contract(
        account,
        config.aTokenAccount,
        ftMethods
    );
    let msg = await accountUseContract.storage_deposit({ args: { "account_id": user } , amount: "1250000000000000000000"});

    accountUseContract = new nearAPI.Contract(
        account,
        config.bTokenAccount,
        ftMethods
    );
    msg = await accountUseContract.storage_deposit({ args: { "account_id": user } , amount: "1250000000000000000000"});
}

async function test() {
    // 1. Creates testing accounts and deploys amm and tokens
    console.log("Connecting to network and Initialising Master Account");
    await initNear();
    console.log("Creating contracts admin account");
    await masterAccount.createAccount(
        config.adminAccount,
        pubKey,
        new BN(10).pow(new BN(25))
    );
    keyStore.setKey(config.networkId, config.adminAccount, masterKey);
    keyStore.setKey(config.networkId, config.ammAccount, masterKey);

    
    console.log("Creating user accounts");
    const { aliceUseContract, bobUseContract } = await initTest();

    console.log("Deploying Fungible tokens");
    await createTokens(config);

    // 2. Initialize contracts
    const adminAccount = new nearAPI.Account(near.connection, config.adminAccount);

    // init token A
    console.log("Initializing Token contracts")
    let accountUseContract = new nearAPI.Contract(
        adminAccount,
        config.aTokenAccount,
        ftMethods
    );
    await accountUseContract.new({args: {"owner_id": config.adminAccount, "total_supply": "10000000000000", "metadata": { "spec": "ft-1.0.0", "name": "Token A", "symbol": "TOKA", "decimals": 8 }}});

    // init token B
    accountUseContract = new nearAPI.Contract(
        adminAccount,
        config.bTokenAccount,
        ftMethods
    );
    await accountUseContract.new({args: {"owner_id": config.adminAccount, "total_supply": "1000000000000000", "metadata": { "spec": "ft-1.0.0", "name": "Token B", "symbol": "TOKB", "decimals": 6 }}});
    
    // init AMM
    console.log("Initializing AMM contract")
    accountUseContract = new nearAPI.Contract(
        adminAccount,
        config.ammAccount,
        ammMethods
    );
    await accountUseContract.new({args: {
        contract_owner: config.adminAccount,
        account_asset_a: config.aTokenAccount,
        account_asset_b: config.bTokenAccount,
    }});

    // 3. Create tokens accounts
    console.log("Creating accounts on token contracts")
    config.userAccounts.concat([config.ammAccount]).forEach(currAccount => {
        createAccountTokens(currAccount);
    });

    // 4. Init balances for users and AMM  
    console.log("Distributing token balances to users and AMM")
    accountUseContract = new nearAPI.Contract(
        adminAccount,
        config.aTokenAccount,
        ftMethods
    );

    config.userAccounts.concat([config.ammAccount]).forEach(async receiver => {
        await accountUseContract.ft_transfer({
            args: {
                "receiver_id": receiver,
                "amount": "1000000",
            }
        });
    });

    accountUseContract = new nearAPI.Contract(
        adminAccount,
        config.bTokenAccount,
        ftMethods
    );

    let initial_balance_b = 5000000;
    config.userAccounts.concat([config.ammAccount]).forEach( async receiver => {
        await accountUseContract.ft_transfer({
            args: {
                "receiver_id": receiver,
                "amount": "5000000",
            }
        });
    });


    // 6. Can finally swap
    console.log("Perform swap")
    const curr_account = new nearAPI.Account(near.connection, config.userAccounts[0]);
    let userUseAccount = new nearAPI.Contract(
        curr_account,
        config.aTokenAccount,
        ftMethods
    );

    await userUseAccount.ft_transfer_call({
        args: {
            "receiver_id": config.ammAccount,
            "amount": "5000",
            "msg": ""
        },
        amount: "1",

    });

    // check resulting new balance in token b 
    console.log("Checking increased balance in token B for user after swap A to B")
    console.log("Initial balance: " + initial_balance_b.toString())
    userUseAccount = new nearAPI.Contract(
        curr_account,
        config.bTokenAccount,
        ftMethods
    );

    let new_balance_b = await userUseAccount.ft_balance_of({
        args: {
            "account_id": config.userAccounts[0],
        }
    });

    console.log("New balance: " + new_balance_b.toString())

    assert(new_balance_b > initial_balance_b);
}

test();