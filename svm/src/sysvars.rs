#![allow(deprecated)]

use solana_account::{Account, ReadableAccount};
use solana_clock::{Clock, Slot};
use solana_epoch_rewards::EpochRewards;
use solana_epoch_schedule::EpochSchedule;
use solana_hash::Hash;
use solana_program_runtime::sysvar_cache::SysvarCache;
use solana_pubkey::Pubkey;
use solana_rent::Rent;
use solana_slot_hashes::{SlotHashes, MAX_ENTRIES as SLOT_HASHES_MAX_ENTRIES};
use solana_stake_interface::stake_history::{StakeHistory, StakeHistoryEntry};
use solana_sysvar::{
    last_restart_slot::LastRestartSlot, recent_blockhashes::RecentBlockhashes, SysvarSerialize,
};
use solana_sysvar_id::SysvarId;

pub struct Sysvars {
    pub clock: Clock,
    pub epoch_rewards: EpochRewards,
    pub epoch_schedule: EpochSchedule,
    pub last_restart_slot: LastRestartSlot,
    pub rent: Rent,
    pub slot_hashes: SlotHashes,
    pub stake_history: StakeHistory,
    pub recent_blockhashes: RecentBlockhashes,
}

impl Default for Sysvars {
    fn default() -> Self {
        let clock = Clock::default();
        let epoch_schedule = EpochSchedule::without_warmup();

        let slot_hashes = {
            let mut default_slot_hashes = vec![(0, Hash::default()); SLOT_HASHES_MAX_ENTRIES];
            default_slot_hashes[0] = (clock.slot, Hash::default());
            SlotHashes::new(&default_slot_hashes)
        };

        let mut stake_history = StakeHistory::default();
        stake_history.add(clock.epoch, StakeHistoryEntry::default());

        Self {
            clock,
            epoch_rewards: EpochRewards::default(),
            epoch_schedule,
            last_restart_slot: LastRestartSlot::default(),
            rent: Rent {
                lamports_per_byte_year: 6960,
                exemption_threshold: 1.0,
                burn_percent: 0,
            },
            slot_hashes,
            stake_history,
            recent_blockhashes: RecentBlockhashes::default(),
        }
    }
}

impl Sysvars {
    fn sysvar_account<T: SysvarSerialize>(&self, sysvar: &T) -> (Pubkey, Account) {
        let data = bincode::serialize::<T>(sysvar).unwrap();
        let space = data.len();
        let lamports = self.rent.minimum_balance(space);
        let account = Account {
            lamports,
            data,
            owner: solana_sdk_ids::sysvar::id(),
            executable: false,
            ..Default::default()
        };
        (T::id(), account)
    }

    pub fn maybe_create_sysvar_account(&self, pubkey: &Pubkey) -> Option<Account> {
        if *pubkey == Clock::id() {
            Some(self.sysvar_account(&self.clock).1)
        } else if *pubkey == EpochRewards::id() {
            Some(self.sysvar_account(&self.epoch_rewards).1)
        } else if *pubkey == EpochSchedule::id() {
            Some(self.sysvar_account(&self.epoch_schedule).1)
        } else if *pubkey == LastRestartSlot::id() {
            Some(self.sysvar_account(&self.last_restart_slot).1)
        } else if *pubkey == Rent::id() {
            Some(self.sysvar_account(&self.rent).1)
        } else if *pubkey == SlotHashes::id() {
            Some(self.sysvar_account(&self.slot_hashes).1)
        } else if *pubkey == StakeHistory::id() {
            Some(self.sysvar_account(&self.stake_history).1)
        } else if *pubkey == RecentBlockhashes::id() {
            Some(self.sysvar_account(&self.recent_blockhashes).1)
        } else {
            None
        }
    }

    pub fn warp_to_slot(&mut self, slot: Slot) {
        let slot_delta = slot.saturating_sub(self.clock.slot);

        let epoch = self.epoch_schedule.get_epoch(slot);
        let leader_schedule_epoch = self.epoch_schedule.get_leader_schedule_epoch(slot);
        self.clock = Clock {
            slot,
            epoch,
            leader_schedule_epoch,
            ..Default::default()
        };

        if slot_delta > SLOT_HASHES_MAX_ENTRIES as u64 {
            let final_hash_slot = slot - SLOT_HASHES_MAX_ENTRIES as u64;
            let slot_hash_entries = (final_hash_slot..slot)
                .rev()
                .map(|slot| (slot, Hash::default()))
                .collect::<Vec<_>>();
            self.slot_hashes = SlotHashes::new(&slot_hash_entries);
        } else {
            let i = self.slot_hashes.first().map(|h| h.0).unwrap_or(0);
            for s in i..slot {
                self.slot_hashes.add(s, Hash::default());
            }
        }
    }

    pub fn setup_sysvar_cache(&self, accounts: &[(Pubkey, Account)]) -> SysvarCache {
        let mut sysvar_cache = SysvarCache::default();

        // Fill from provided accounts first.
        sysvar_cache.fill_missing_entries(|pubkey, set_sysvar| {
            if let Some((_, account)) = accounts.iter().find(|(key, _)| key == pubkey) {
                set_sysvar(account.data())
            }
        });

        // Then fill the rest from our defaults.
        sysvar_cache.fill_missing_entries(|pubkey, set_sysvar| {
            if *pubkey == Clock::id() {
                set_sysvar(&bincode::serialize(&self.clock).unwrap());
            }
            if *pubkey == EpochRewards::id() {
                set_sysvar(&bincode::serialize(&self.epoch_rewards).unwrap());
            }
            if *pubkey == EpochSchedule::id() {
                set_sysvar(&bincode::serialize(&self.epoch_schedule).unwrap());
            }
            if *pubkey == LastRestartSlot::id() {
                set_sysvar(&bincode::serialize(&self.last_restart_slot).unwrap());
            }
            if *pubkey == Rent::id() {
                set_sysvar(&bincode::serialize(&self.rent).unwrap());
            }
            if *pubkey == SlotHashes::id() {
                set_sysvar(&bincode::serialize(&self.slot_hashes).unwrap());
            }
            if *pubkey == StakeHistory::id() {
                set_sysvar(&bincode::serialize(&self.stake_history).unwrap());
            }
            if *pubkey == RecentBlockhashes::id() {
                set_sysvar(&bincode::serialize(&self.recent_blockhashes).unwrap());
            }
        });

        sysvar_cache
    }
}
