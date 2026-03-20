use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

const COMP_DEF_OFFSET_COMPUTE_SIMILARITY: u32 = comp_def_offset("compute_similarity");
const MARKER_COUNT: usize = 16;

declare_id!("2NaVBnwtSzp32CMnhrZw8CWbhj4Ftx3u94zbkLptqbTP");

#[arcium_program]
pub mod genome_shield {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let state = &mut ctx.accounts.program_state;
        state.authority = ctx.accounts.authority.key();
        state.total_comparisons = 0;
        state.total_profiles = 0;
        Ok(())
    }

    pub fn register_profile(ctx: Context<RegisterProfile>, profile_hash: [u8; 32]) -> Result<()> {
        let profile = &mut ctx.accounts.genome_profile;
        profile.owner = ctx.accounts.authority.key();
        profile.profile_hash = profile_hash;
        profile.comparison_count = 0;
        profile.bump = ctx.bumps.genome_profile;
        let state = &mut ctx.accounts.program_state;
        state.total_profiles += 1;
        Ok(())
    }

    pub fn init_compute_similarity_comp_def(ctx: Context<InitComputeSimilarityCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn compute_similarity(
        ctx: Context<ComputeSimilarity>,
        computation_offset: u64,
        ct_markers_a: [[u8; 32]; MARKER_COUNT],
        ct_count_a: [u8; 32],
        pub_key_a: [u8; 32],
        nonce_a: u128,
        ct_markers_b: [[u8; 32]; MARKER_COUNT],
        ct_count_b: [u8; 32],
        pub_key_b: [u8; 32],
        nonce_b: u128,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let mut builder = ArgBuilder::new()
            .x25519_pubkey(pub_key_a)
            .plaintext_u128(nonce_a);
        for i in 0..MARKER_COUNT {
            builder = builder.encrypted_u128(ct_markers_a[i]);
        }
        builder = builder.encrypted_u8(ct_count_a);

        builder = builder
            .x25519_pubkey(pub_key_b)
            .plaintext_u128(nonce_b);
        for i in 0..MARKER_COUNT {
            builder = builder.encrypted_u128(ct_markers_b[i]);
        }
        builder = builder.encrypted_u8(ct_count_b);
        let args = builder.build();

        let comparison_pda = ctx.accounts.comparison_record.key();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![ComputeSimilarityCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount {
                    pubkey: comparison_pda,
                    is_writable: true,
                }],
            )?],
            1,
            0,
        )?;
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "compute_similarity")]
    pub fn compute_similarity_callback(
        ctx: Context<ComputeSimilarityCallback>,
        output: SignedComputationOutputs<ComputeSimilarityOutput>,
    ) -> Result<()> {
        let _o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(ComputeSimilarityOutput { field_0 }) => field_0,
            Err(_) => return Err(ErrorCode::AbortedComputation.into()),
        };
        let record = &mut ctx.accounts.comparison_record;
        record.completed = true;
        emit!(SimilarityComputedEvent {
            comparison_id: record.comparison_id,
        });
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
pub struct RegisterProfile<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + GenomeProfile::INIT_SPACE, seeds = [b"genome_profile", authority.key().as_ref()], bump)]
    pub genome_profile: Account<'info, GenomeProfile>,
    #[account(mut, seeds = [b"program_state"], bump)]
    pub program_state: Account<'info, ProgramState>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("compute_similarity", payer)]
#[derive(Accounts)]
pub struct InitComputeSimilarityCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[queue_computation_accounts("compute_similarity", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct ComputeSimilarity<'info> {
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_SIMILARITY))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    #[account(init, payer = payer, space = 8 + ComparisonRecord::INIT_SPACE, seeds = [b"comparison", computation_offset.to_le_bytes().as_ref()], bump)]
    pub comparison_record: Account<'info, ComparisonRecord>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("compute_similarity")]
#[derive(Accounts)]
pub struct ComputeSimilarityCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_SIMILARITY))]
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
    pub comparison_record: Account<'info, ComparisonRecord>,
}

#[account]
#[derive(InitSpace)]
pub struct ProgramState {
    pub authority: Pubkey,
    pub total_comparisons: u64,
    pub total_profiles: u64,
}

#[account]
#[derive(InitSpace)]
pub struct GenomeProfile {
    pub owner: Pubkey,
    pub profile_hash: [u8; 32],
    pub comparison_count: u32,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ComparisonRecord {
    pub user_a: Pubkey,
    pub user_b: Pubkey,
    pub comparison_id: u64,
    pub completed: bool,
    pub timestamp: i64,
}

#[event]
pub struct SimilarityComputedEvent {
    pub comparison_id: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("The computation was aborted")]
    AbortedComputation,
    #[msg("Cluster not set")]
    ClusterNotSet,
}
