use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

const COMP_DEF_OFFSET_CHECK_ACCESS: u32 = comp_def_offset("check_access");
const MAX_POLICIES: usize = 8;

declare_id!("2mytDh5J6gN1BAyrwgGfdrCPHAe6v6BbGTbTDANVQXKP");

#[arcium_program]
pub mod cipher_gate {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let state = &mut ctx.accounts.program_state;
        state.authority = ctx.accounts.authority.key();
        state.total_resources = 0;
        state.total_access_checks = 0;
        Ok(())
    }

    pub fn register_resource(
        ctx: Context<RegisterResource>,
        resource_name: String,
        resource_uri: String,
        storage_type: u8,
    ) -> Result<()> {
        let resource = &mut ctx.accounts.resource;
        resource.owner = ctx.accounts.authority.key();
        resource.name = resource_name;
        resource.uri = resource_uri;
        resource.storage_type = storage_type;
        resource.policy_count = 0;
        resource.total_accesses = 0;
        resource.bump = ctx.bumps.resource;
        let state = &mut ctx.accounts.program_state;
        state.total_resources += 1;
        resource.resource_id = state.total_resources;
        Ok(())
    }

    pub fn add_policy(
        ctx: Context<AddPolicy>,
        allowed_user: Pubkey,
        expiry_time: i64,
        min_payment: u64,
    ) -> Result<()> {
        let resource = &mut ctx.accounts.resource;
        let idx = resource.policy_count as usize;
        if idx >= MAX_POLICIES { return Err(ErrorCode::MaxPoliciesReached.into()); }
        resource.allowed_users[idx] = allowed_user;
        resource.expiry_times[idx] = expiry_time;
        resource.min_payments[idx] = min_payment;
        resource.revoked[idx] = false;
        resource.policy_count += 1;
        Ok(())
    }

    pub fn revoke_access(ctx: Context<RevokeAccess>, policy_index: u8) -> Result<()> {
        let resource = &mut ctx.accounts.resource;
        resource.revoked[policy_index as usize] = true;
        emit!(AccessRevokedEvent {
            resource_id: resource.resource_id,
            policy_index,
        });
        Ok(())
    }

    pub fn init_check_access_comp_def(ctx: Context<InitCheckAccessCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn check_access(
        ctx: Context<CheckAccess>,
        computation_offset: u64,
        ct_requester_id: [u8; 32],
        ct_resource_id: [u8; 32],
        ct_timestamp: [u8; 32],
        ct_payment: [u8; 32],
        pub_key_req: [u8; 32],
        nonce_req: u128,
        ct_pol_resource_id: [u8; 32],
        ct_pol_owner_id: [u8; 32],
        ct_allowed: [[u8; 32]; MAX_POLICIES],
        ct_expiries: [[u8; 32]; MAX_POLICIES],
        ct_min_pays: [[u8; 32]; MAX_POLICIES],
        ct_pol_count: [u8; 32],
        ct_revoked: [[u8; 32]; MAX_POLICIES],
        pub_key_pol: [u8; 32],
        nonce_pol: u128,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let mut builder = ArgBuilder::new()
            .x25519_pubkey(pub_key_req)
            .plaintext_u128(nonce_req)
            .encrypted_u128(ct_requester_id)
            .encrypted_u128(ct_resource_id)
            .encrypted_u128(ct_timestamp)
            .encrypted_u128(ct_payment);

        builder = builder
            .x25519_pubkey(pub_key_pol)
            .plaintext_u128(nonce_pol)
            .encrypted_u128(ct_pol_resource_id)
            .encrypted_u128(ct_pol_owner_id);
        for i in 0..MAX_POLICIES {
            builder = builder.encrypted_u128(ct_allowed[i]);
        }
        for i in 0..MAX_POLICIES {
            builder = builder.encrypted_u128(ct_expiries[i]);
        }
        for i in 0..MAX_POLICIES {
            builder = builder.encrypted_u128(ct_min_pays[i]);
        }
        builder = builder.encrypted_u8(ct_pol_count);
        for i in 0..MAX_POLICIES {
            builder = builder.encrypted_u8(ct_revoked[i]);
        }
        let args = builder.build();

        let access_log_pda = ctx.accounts.access_log.key();
        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![CheckAccessCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount { pubkey: access_log_pda, is_writable: true }],
            )?],
            1,
            0,
        )?;
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "check_access")]
    pub fn check_access_callback(
        ctx: Context<CheckAccessCallback>,
        output: SignedComputationOutputs<CheckAccessOutput>,
    ) -> Result<()> {
        let _o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(CheckAccessOutput { field_0 }) => field_0,
            Err(_) => return Err(ErrorCode::AbortedComputation.into()),
        };
        let log = &mut ctx.accounts.access_log;
        log.completed = true;
        emit!(AccessCheckedEvent { log_id: log.log_id });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + ProgramState::INIT_SPACE, seeds = [b"program_state"], bump)]
    pub program_state: Account<'info, ProgramState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(resource_name: String)]
pub struct RegisterResource<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + Resource::INIT_SPACE, seeds = [b"resource", authority.key().as_ref(), &(program_state.total_resources + 1).to_le_bytes()], bump)]
    pub resource: Account<'info, Resource>,
    #[account(mut, seeds = [b"program_state"], bump)]
    pub program_state: Account<'info, ProgramState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddPolicy<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, constraint = resource.owner == authority.key())]
    pub resource: Account<'info, Resource>,
}

#[derive(Accounts)]
pub struct RevokeAccess<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, constraint = resource.owner == authority.key())]
    pub resource: Account<'info, Resource>,
}

#[init_computation_definition_accounts("check_access", payer)]
#[derive(Accounts)]
pub struct InitCheckAccessCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[queue_computation_accounts("check_access", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct CheckAccess<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init_if_needed, space = 9, payer = payer, seeds = [&SIGN_PDA_SEED], bump, address = derive_sign_pda!())]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: mempool_account
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: executing_pool
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CHECK_ACCESS))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    #[account(init, payer = payer, space = 8 + AccessLog::INIT_SPACE, seeds = [b"access_log", computation_offset.to_le_bytes().as_ref()], bump)]
    pub access_log: Account<'info, AccessLog>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("check_access")]
#[derive(Accounts)]
pub struct CheckAccessCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CHECK_ACCESS))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub access_log: Account<'info, AccessLog>,
}

#[account]
#[derive(InitSpace)]
pub struct ProgramState {
    pub authority: Pubkey,
    pub total_resources: u64,
    pub total_access_checks: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Resource {
    pub owner: Pubkey,
    pub resource_id: u64,
    #[max_len(64)]
    pub name: String,
    #[max_len(128)]
    pub uri: String,
    pub storage_type: u8,
    pub policy_count: u8,
    pub allowed_users: [Pubkey; 8],
    pub expiry_times: [i64; 8],
    pub min_payments: [u64; 8],
    pub revoked: [bool; 8],
    pub total_accesses: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct AccessLog {
    pub requester: Pubkey,
    pub resource_id: u64,
    pub log_id: u64,
    pub completed: bool,
    pub timestamp: i64,
}

#[event]
pub struct AccessCheckedEvent { pub log_id: u64 }

#[event]
pub struct AccessRevokedEvent { pub resource_id: u64, pub policy_index: u8 }

#[error_code]
pub enum ErrorCode {
    #[msg("Computation aborted")]
    AbortedComputation,
    #[msg("Cluster not set")]
    ClusterNotSet,
    #[msg("Max policies reached")]
    MaxPoliciesReached,
}
