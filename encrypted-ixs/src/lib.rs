use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    const MAX_POLICIES: usize = 8;

    pub struct AccessRequest {
        requester_id: u128,
        resource_id: u128,
        timestamp: u128,
        payment_amount: u128,
    }

    pub struct AccessPolicy {
        resource_id: u128,
        owner_id: u128,
        allowed_users: [u128; MAX_POLICIES],
        expiry_times: [u128; MAX_POLICIES],
        min_payments: [u128; MAX_POLICIES],
        policy_count: u8,
        revoked: [bool; MAX_POLICIES],
    }

    pub struct AccessResult {
        granted: u8,
        decryption_key_fragment: u128,
        policy_index: u8,
        reason_code: u8,
    }

    #[instruction]
    pub fn check_access(
        request: Enc<Shared, AccessRequest>,
        policy: Enc<Shared, AccessPolicy>,
    ) -> Enc<Shared, AccessResult> {
        let req = request.to_arcis();
        let pol = policy.to_arcis();

        let mut granted: u8 = 0;
        let mut key_fragment: u128 = 0;
        let mut matched_idx: u8 = 0;
        let mut reason: u8 = 1;

        for i in 0..MAX_POLICIES {
            let valid_policy = (i as u8) < pol.policy_count;
            let user_match = pol.allowed_users[i] == req.requester_id;
            let not_expired = req.timestamp <= pol.expiry_times[i];
            let paid_enough = req.payment_amount >= pol.min_payments[i];
            let not_revoked = !pol.revoked[i];
            let resource_match = pol.resource_id == req.resource_id;

            let all_pass = valid_policy && user_match && not_expired && paid_enough && not_revoked && resource_match;

            if all_pass {
                granted = 1;
                key_fragment = pol.owner_id + req.requester_id + req.resource_id;
                matched_idx = i as u8;
                reason = 0;
            }
        }

        let result = AccessResult {
            granted,
            decryption_key_fragment: key_fragment,
            policy_index: matched_idx,
            reason_code: reason,
        };

        request.owner.from_arcis(result)
    }
}
