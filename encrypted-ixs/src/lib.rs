use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    const TEMPLATE_SIZE: usize = 4;

    pub struct BiometricTemplate {
        features: [u128; TEMPLATE_SIZE],
        count: u8,
    }

    pub struct AuthResult {
        is_match: u8,
        similarity: u128,
        compared: u8,
    }

    #[instruction]
    pub fn verify_biometric(
        stored_template: Enc<Shared, BiometricTemplate>,
        live_scan: Enc<Shared, BiometricTemplate>,
    ) -> Enc<Shared, AuthResult> {
        let stored = stored_template.to_arcis();
        let live = live_scan.to_arcis();

        let mut matched: u8 = 0;
        let mut compared: u8 = 0;

        for i in 0..TEMPLATE_SIZE {
            let s_valid = (i as u8) < stored.count;
            let l_valid = (i as u8) < live.count;
            let both_valid = s_valid && l_valid;
            let features_match = stored.features[i] == live.features[i];
            let non_zero = stored.features[i] != 0;

            if both_valid {
                compared = compared + 1;
            }
            if both_valid && features_match && non_zero {
                matched = matched + 1;
            }
        }

        let similarity: u128 = if compared > 0 {
            (matched as u128) * 10000 / (compared as u128)
        } else {
            0
        };

        let threshold: u128 = 7000;
        let is_match: u8 = if similarity >= threshold { 1 } else { 0 };

        let result = AuthResult {
            is_match,
            similarity,
            compared,
        };

        stored_template.owner.from_arcis(result)
    }
}
