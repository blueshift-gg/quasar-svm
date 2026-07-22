use std::cell::{RefCell, RefMut};
use std::collections::HashMap;
use std::rc::Rc;
use std::sync::Arc;

use agave_feature_set::FeatureSet;
use agave_syscalls::create_program_runtime_environment_v1;
use solana_account::Account;
use solana_compute_budget::compute_budget::ComputeBudget;
use solana_loader_v3_interface::state::UpgradeableLoaderState;
use solana_program_runtime::invoke_context::{BuiltinFunctionWithContext, InvokeContext};
use solana_program_runtime::loaded_programs::{
    LoadProgramMetrics, ProgramCacheEntry, ProgramCacheForTxBatch,
};
use solana_program_runtime::solana_sbpf::program::BuiltinProgram;
use solana_pubkey::Pubkey;
use solana_rent::Rent;

pub mod loader_keys {
    pub use solana_sdk_ids::{
        bpf_loader::ID as LOADER_V2, bpf_loader_upgradeable::ID as LOADER_V3,
        native_loader::ID as NATIVE_LOADER,
    };
}

struct CacheEntry {
    loader_key: Pubkey,
    elf: Option<Arc<[u8]>>,
}

pub struct ProgramCache {
    cache: Rc<RefCell<ProgramCacheForTxBatch>>,
    entries: Rc<RefCell<HashMap<Pubkey, CacheEntry>>>,
    pub runtime_environment: BuiltinProgram<InvokeContext<'static, 'static>>,
}

struct Builtin {
    program_id: Pubkey,
    name: &'static str,
    entrypoint: BuiltinFunctionWithContext,
}

impl Builtin {
    fn program_cache_entry(&self) -> Arc<ProgramCacheEntry> {
        Arc::new(ProgramCacheEntry::new_builtin(
            0,
            self.name.len(),
            self.entrypoint,
        ))
    }
}

static BUILTINS: &[Builtin] = &[
    Builtin {
        program_id: solana_system_program::id(),
        name: "system_program",
        entrypoint: solana_system_program::system_processor::Entrypoint::vm,
    },
    Builtin {
        program_id: loader_keys::LOADER_V2,
        name: "solana_bpf_loader_program",
        entrypoint: solana_bpf_loader_program::Entrypoint::vm,
    },
    Builtin {
        program_id: loader_keys::LOADER_V3,
        name: "solana_bpf_loader_upgradeable_program",
        entrypoint: solana_bpf_loader_program::Entrypoint::vm,
    },
];

impl ProgramCache {
    pub fn new(feature_set: &FeatureSet, compute_budget: &ComputeBudget) -> Self {
        let me = Self {
            cache: Rc::new(RefCell::new(ProgramCacheForTxBatch::default())),
            entries: Rc::new(RefCell::new(HashMap::new())),
            runtime_environment: create_program_runtime_environment_v1(
                &feature_set.runtime_features(),
                &compute_budget.to_budget(),
                false,
                false,
            )
            .unwrap(),
        };
        for builtin in BUILTINS {
            let entry = builtin.program_cache_entry();
            me.replenish(builtin.program_id, entry, None);
        }
        me
    }

    pub fn cache(&self) -> RefMut<'_, ProgramCacheForTxBatch> {
        self.cache.borrow_mut()
    }

    fn replenish(&self, program_id: Pubkey, entry: Arc<ProgramCacheEntry>, elf: Option<Arc<[u8]>>) {
        let loader_key = entry.account_owner();
        self.entries
            .borrow_mut()
            .insert(program_id, CacheEntry { loader_key, elf });
        self.cache.borrow_mut().replenish(program_id, entry);
    }

    pub fn add_program(&self, program_id: &Pubkey, loader_key: &Pubkey, elf: &[u8]) {
        let elf_arc: Arc<[u8]> = Arc::from(elf);
        let environment = {
            let config = self.runtime_environment.get_config().clone();
            let mut loader = BuiltinProgram::new_loader(config);
            for (_key, (name, value)) in self.runtime_environment.get_function_registry().iter() {
                let name = std::str::from_utf8(name).unwrap();
                loader.register_function(name, value).unwrap();
            }
            Arc::new(loader)
        };
        self.replenish(
            *program_id,
            Arc::new(
                ProgramCacheEntry::new(
                    loader_key,
                    environment,
                    0,
                    0,
                    elf,
                    elf.len(),
                    &mut LoadProgramMetrics::default(),
                )
                .unwrap(),
            ),
            Some(elf_arc),
        );
    }

    pub fn load_program(&self, program_id: &Pubkey) -> Option<Arc<ProgramCacheEntry>> {
        self.cache.borrow().find(program_id)
    }

    /// Create fallback accounts for a program that's in the cache.
    /// For LOADER_V3 programs, returns both the program account and its programdata account.
    pub fn maybe_create_program_accounts(&self, pubkey: &Pubkey) -> Vec<(Pubkey, Account)> {
        let entries = self.entries.borrow();
        let Some(entry) = entries.get(pubkey) else {
            return vec![];
        };
        match entry.loader_key {
            loader_keys::NATIVE_LOADER => {
                let data = b"builtin".to_vec();
                let lamports = Rent::default().minimum_balance(data.len());
                vec![(
                    *pubkey,
                    Account {
                        lamports,
                        data,
                        owner: loader_keys::NATIVE_LOADER,
                        executable: true,
                        ..Default::default()
                    },
                )]
            }
            loader_keys::LOADER_V2 => vec![(
                *pubkey,
                Account {
                    lamports: Rent::default().minimum_balance(0),
                    data: vec![],
                    owner: loader_keys::LOADER_V2,
                    executable: true,
                    ..Default::default()
                },
            )],
            loader_keys::LOADER_V3 => {
                let (programdata_address, _) =
                    Pubkey::find_program_address(&[pubkey.as_ref()], &loader_keys::LOADER_V3);

                // Program account
                let program_data = bincode::serialize(&UpgradeableLoaderState::Program {
                    programdata_address,
                })
                .unwrap();
                let program_account = Account {
                    lamports: Rent::default().minimum_balance(program_data.len()),
                    data: program_data,
                    owner: loader_keys::LOADER_V3,
                    executable: true,
                    ..Default::default()
                };

                // Programdata account
                let programdata_header = bincode::serialize(&UpgradeableLoaderState::ProgramData {
                    slot: 0,
                    upgrade_authority_address: None,
                })
                .unwrap();
                let mut programdata_bytes = programdata_header;
                if let Some(elf) = &entry.elf {
                    programdata_bytes.extend_from_slice(elf);
                }
                let programdata_account = Account {
                    lamports: Rent::default().minimum_balance(programdata_bytes.len()),
                    data: programdata_bytes,
                    owner: loader_keys::LOADER_V3,
                    executable: false,
                    ..Default::default()
                };

                vec![
                    (*pubkey, program_account),
                    (programdata_address, programdata_account),
                ]
            }
            _ => vec![(
                *pubkey,
                Account {
                    executable: true,
                    ..Default::default()
                },
            )],
        }
    }
}
