use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

const COMP_DEF_OFFSET_VERIFY_BIOMETRIC: u32 = comp_def_offset("verify_biometric");
const TEMPLATE_SIZE: usize = 4;

declare_id!("4rfPEFE5wSfqQMG7bw5MqPrwA9KSsYsi5sVaWRsY1ShU");

#[arcium_program]
pub mod bio_auth {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let state = &mut ctx.accounts.program_state;
        state.authority = ctx.accounts.authority.key();
        state.total_users = 0;
        state.total_verifications = 0;
        Ok(())
    }

    pub fn register_identity(
        ctx: Context<RegisterIdentity>,
        identity_hash: [u8; 32],
        template_type: u8,
    ) -> Result<()> {
        let identity = &mut ctx.accounts.identity;
        identity.owner = ctx.accounts.authority.key();
        identity.identity_hash = identity_hash;
        identity.template_type = template_type;
        identity.verification_count = 0;
        identity.last_verified = 0;
        identity.active = true;
        identity.bump = ctx.bumps.identity;
        let state = &mut ctx.accounts.program_state;
        state.total_users += 1;
        Ok(())
    }

    pub fn init_verify_biometric_comp_def(ctx: Context<InitVerifyBiometricCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn verify_biometric(
        ctx: Context<VerifyBiometric>,
        computation_offset: u64,
        ct_stored_features: [[u8; 32]; TEMPLATE_SIZE],
        ct_stored_count: [u8; 32],
        pub_key_stored: [u8; 32],
        nonce_stored: u128,
        ct_live_features: [[u8; 32]; TEMPLATE_SIZE],
        ct_live_count: [u8; 32],
        pub_key_live: [u8; 32],
        nonce_live: u128,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let mut builder = ArgBuilder::new()
            .x25519_pubkey(pub_key_stored)
            .plaintext_u128(nonce_stored);
        for i in 0..TEMPLATE_SIZE {
            builder = builder.encrypted_u128(ct_stored_features[i]);
        }
        builder = builder.encrypted_u8(ct_stored_count);

        builder = builder
            .x25519_pubkey(pub_key_live)
            .plaintext_u128(nonce_live);
        for i in 0..TEMPLATE_SIZE {
            builder = builder.encrypted_u128(ct_live_features[i]);
        }
        builder = builder.encrypted_u8(ct_live_count);
        let args = builder.build();

        let auth_log_pda = ctx.accounts.auth_log.key();
        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![VerifyBiometricCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount { pubkey: auth_log_pda, is_writable: true }],
            )?],
            1,
            0,
        )?;
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "verify_biometric")]
    pub fn verify_biometric_callback(
        ctx: Context<VerifyBiometricCallback>,
        output: SignedComputationOutputs<VerifyBiometricOutput>,
    ) -> Result<()> {
        let _o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(VerifyBiometricOutput { field_0 }) => field_0,
            Err(_) => return Err(ErrorCode::AbortedComputation.into()),
        };
        let log = &mut ctx.accounts.auth_log;
        log.completed = true;
        emit!(VerificationEvent { log_id: log.log_id });
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
pub struct RegisterIdentity<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + Identity::INIT_SPACE, seeds = [b"identity", authority.key().as_ref()], bump)]
    pub identity: Account<'info, Identity>,
    #[account(mut, seeds = [b"program_state"], bump)]
    pub program_state: Account<'info, ProgramState>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("verify_biometric", payer)]
#[derive(Accounts)]
pub struct InitVerifyBiometricCompDef<'info> {
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

#[queue_computation_accounts("verify_biometric", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct VerifyBiometric<'info> {
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_VERIFY_BIOMETRIC))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    #[account(init, payer = payer, space = 8 + AuthLog::INIT_SPACE, seeds = [b"auth_log", computation_offset.to_le_bytes().as_ref()], bump)]
    pub auth_log: Account<'info, AuthLog>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("verify_biometric")]
#[derive(Accounts)]
pub struct VerifyBiometricCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_VERIFY_BIOMETRIC))]
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
    pub auth_log: Account<'info, AuthLog>,
}

#[account]
#[derive(InitSpace)]
pub struct ProgramState {
    pub authority: Pubkey,
    pub total_users: u64,
    pub total_verifications: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Identity {
    pub owner: Pubkey,
    pub identity_hash: [u8; 32],
    pub template_type: u8,
    pub verification_count: u32,
    pub last_verified: i64,
    pub active: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct AuthLog {
    pub requester: Pubkey,
    pub log_id: u64,
    pub completed: bool,
    pub timestamp: i64,
}

#[event]
pub struct VerificationEvent { pub log_id: u64 }

#[error_code]
pub enum ErrorCode {
    #[msg("Computation aborted")]
    AbortedComputation,
    #[msg("Cluster not set")]
    ClusterNotSet,
}
