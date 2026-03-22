use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    pub struct VerifyInput {
        stored_f1: u128,
        stored_f2: u128,
        stored_count: u8,
        live_f1: u128,
        live_f2: u128,
        live_count: u8,
    }

    pub struct AuthResult {
        is_match: u8,
        similarity: u128,
        compared: u8,
    }

    #[instruction]
    pub fn verify_biometric(
        input: Enc<Shared, VerifyInput>,
    ) -> Enc<Shared, AuthResult> {
        let d = input.to_arcis();

        let mut matched: u8 = 0;
        let mut compared: u8 = 0;

        let s1_valid = 0 < d.stored_count;
        let l1_valid = 0 < d.live_count;
        let both1 = s1_valid && l1_valid;
        let match1 = d.stored_f1 == d.live_f1;
        let nz1 = d.stored_f1 != 0;
        if both1 { compared = compared + 1; }
        if both1 && match1 && nz1 { matched = matched + 1; }

        let s2_valid = 1 < d.stored_count;
        let l2_valid = 1 < d.live_count;
        let both2 = s2_valid && l2_valid;
        let match2 = d.stored_f2 == d.live_f2;
        let nz2 = d.stored_f2 != 0;
        if both2 { compared = compared + 1; }
        if both2 && match2 && nz2 { matched = matched + 1; }

        let similarity: u128 = if compared > 0 {
            (matched as u128) * 10000 / (compared as u128)
        } else {
            0
        };

        let threshold: u128 = 7000;
        let is_match: u8 = if similarity >= threshold { 1 } else { 0 };

        let result = AuthResult { is_match, similarity, compared };
        input.owner.from_arcis(result)
    }
}
