#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol};

#[contracttype]
#[derive(Clone)]
pub struct Tool {
    pub provider: Address,
    pub price: i128,
    pub category: Symbol,
    pub endpoint: String,
    pub reputation: i128,
}

#[contract]
pub struct RegistryContract;

#[contractimpl]
impl RegistryContract {
    pub fn register_tool(env: Env, tool_id: Symbol, provider: Address, price: i128, category: Symbol, endpoint: String) {
        provider.require_auth();
        
        let tool = Tool {
            provider,
            price,
            category,
            endpoint,
            reputation: 0,
        };
        
        env.storage().persistent().set(&tool_id, &tool);
        env.events().publish((symbol_short!("register"), tool_id), tool.price);
    }

    pub fn get_tool(env: Env, tool_id: Symbol) -> Option<Tool> {
        env.storage().persistent().get(&tool_id)
    }

    pub fn attest_tool(env: Env, tool_id: Symbol, success: bool) {
        if let Some(mut tool) = env.storage().persistent().get::<_, Tool>(&tool_id) {
            if success {
                tool.reputation += 1;
            } else {
                tool.reputation -= 1;
            }
            env.storage().persistent().set(&tool_id, &tool);
            env.events().publish((symbol_short!("attest"), tool_id), tool.reputation);
        }
    }
}
