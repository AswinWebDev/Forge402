#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, String, token};

#[contracttype]
#[derive(Clone)]
pub struct EscrowTask {
    pub funder: Address,
    pub worker: Address,
    pub amount: i128,
    pub token: Address,
    pub status: Symbol, // 'locked', 'released', 'refunded'
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    pub fn create_escrow(env: Env, task_id: Symbol, funder: Address, worker: Address, token: Address, amount: i128) {
        funder.require_auth();
        
        let client = token::Client::new(&env, &token);
        client.transfer(&funder, &env.current_contract_address(), &amount);

        let task = EscrowTask {
            funder,
            worker,
            amount,
            token,
            status: symbol_short!("locked"),
        };
        
        env.storage().persistent().set(&task_id, &task);
        env.events().publish((symbol_short!("escrow"), task_id), amount);
    }

    pub fn release_funds(env: Env, task_id: Symbol, _proof: String) {
        if let Some(mut task) = env.storage().persistent().get::<_, EscrowTask>(&task_id) {
            assert!(task.status == symbol_short!("locked"), "task is not locked");

            task.funder.require_auth(); // Only funder can explicitly release for now
            let client = token::Client::new(&env, &task.token);
            client.transfer(&env.current_contract_address(), &task.worker, &task.amount);

            task.status = symbol_short!("released");
            env.storage().persistent().set(&task_id, &task);
            
            env.events().publish((symbol_short!("release"), task_id), task.amount);
        }
    }
    
    pub fn refund(env: Env, task_id: Symbol) {
        if let Some(mut task) = env.storage().persistent().get::<_, EscrowTask>(&task_id) {
            assert!(task.status == symbol_short!("locked"), "task is not locked");

            task.worker.require_auth(); // Worker can voluntarily refund
            let client = token::Client::new(&env, &task.token);
            client.transfer(&env.current_contract_address(), &task.funder, &task.amount);

            task.status = symbol_short!("refunded");
            env.storage().persistent().set(&task_id, &task);
            
            env.events().publish((symbol_short!("refund"), task_id), task.amount);
        }
    }
}
