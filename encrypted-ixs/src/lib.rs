use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    const MARKER_COUNT: usize = 16;

    pub struct GenomeProfile {
        markers: [u128; MARKER_COUNT],
        count: u8,
    }

    pub struct MatchResult {
        similarity_score: u128,
        matched_markers: u8,
        total_compared: u8,
    }

    #[instruction]
    pub fn compute_similarity(
        profile_a: Enc<Shared, GenomeProfile>,
        profile_b: Enc<Shared, GenomeProfile>,
    ) -> (Enc<Shared, MatchResult>, Enc<Shared, MatchResult>) {
        let a = profile_a.to_arcis();
        let b = profile_b.to_arcis();

        let mut matched: u8 = 0;
        let mut compared: u8 = 0;

        for i in 0..MARKER_COUNT {
            let a_valid = (i as u8) < a.count;
            let b_valid = (i as u8) < b.count;
            let both_valid = a_valid && b_valid;
            let markers_match = a.markers[i] == b.markers[i];
            let non_zero = a.markers[i] != 0;

            if both_valid {
                compared = compared + 1;
            }
            if both_valid && markers_match && non_zero {
                matched = matched + 1;
            }
        }

        let score: u128 = if compared > 0 {
            (matched as u128) * 10000 / (compared as u128)
        } else {
            0
        };

        let result = MatchResult {
            similarity_score: score,
            matched_markers: matched,
            total_compared: compared,
        };

        let result_b = MatchResult {
            similarity_score: score,
            matched_markers: matched,
            total_compared: compared,
        };

        (profile_a.owner.from_arcis(result), profile_b.owner.from_arcis(result_b))
    }
}
