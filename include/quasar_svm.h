#ifndef QUASAR_SVM_H
#define QUASAR_SVM_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#define QUASAR_OK 0

#define QUASAR_ERR_NULL_POINTER -1

#define QUASAR_ERR_INVALID_UTF8 -2

#define QUASAR_ERR_PROGRAM_LOAD -3

#define QUASAR_ERR_EXECUTION -4

#define QUASAR_ERR_OUT_OF_BOUNDS -5

#define QUASAR_ERR_INTERNAL -99

const char *quasar_last_error(void);

QuasarSvm *quasar_svm_new(bool token, bool token_2022, bool associated_token);

void quasar_svm_free(QuasarSvm *svm);

int32_t quasar_svm_add_program(QuasarSvm *svm,
                               const uint8_t (*program_id)[32],
                               const uint8_t *elf_data,
                               uint64_t elf_len,
                               uint8_t loader_version);

int32_t quasar_svm_set_clock(QuasarSvm *svm,
                             uint64_t slot,
                             int64_t epoch_start_timestamp,
                             uint64_t epoch,
                             uint64_t leader_schedule_epoch,
                             int64_t unix_timestamp);

int32_t quasar_svm_warp_to_slot(QuasarSvm *svm, uint64_t slot);

int32_t quasar_svm_set_rent(QuasarSvm *svm, uint64_t lamports_per_byte_year);

int32_t quasar_svm_set_epoch_schedule(QuasarSvm *svm,
                                      uint64_t slots_per_epoch,
                                      uint64_t leader_schedule_slot_offset,
                                      bool warmup,
                                      uint64_t first_normal_epoch,
                                      uint64_t first_normal_slot);

int32_t quasar_svm_set_compute_budget(QuasarSvm *svm, uint64_t max_units);

int32_t quasar_svm_warp_to_timestamp(QuasarSvm *svm, int64_t timestamp);

/**
 * Store an account in the SVM's account database.
 * `acct_bytes` / `acct_len`: count-prefixed serialized accounts (wire format).
 */
int32_t quasar_svm_set_account(QuasarSvm *svm, const uint8_t *acct_bytes, uint64_t acct_len);

/**
 * Read an account from the SVM's account database.
 * On success, writes a serialized account (no count prefix) to `result_out` / `result_len_out`.
 * Caller must free via `quasar_result_free`.
 */
int32_t quasar_svm_get_account(QuasarSvm *svm,
                               const uint8_t (*pubkey)[32],
                               uint8_t **result_out,
                               uint64_t *result_len_out);

/**
 * Airdrop lamports to an account, creating it if it doesn't exist.
 */
int32_t quasar_svm_airdrop(QuasarSvm *svm, const uint8_t (*pubkey)[32], uint64_t lamports);

/**
 * Get the lamport balance of an account. Writes 0 if the account doesn't exist.
 */
int32_t quasar_svm_get_balance(QuasarSvm *svm, const uint8_t (*pubkey)[32], uint64_t *out_lamports);

/**
 * Create a rent-exempt account with the given space and owner.
 */
int32_t quasar_svm_create_account(QuasarSvm *svm,
                                  const uint8_t (*pubkey)[32],
                                  uint64_t space,
                                  const uint8_t (*owner)[32]);

/**
 * Set the token balance of an existing SPL Token account.
 * Returns `QUASAR_ERR_EXECUTION` if the account is missing or not a valid token account.
 */
int32_t quasar_svm_set_token_balance(QuasarSvm *svm, const uint8_t (*pubkey)[32], uint64_t amount);

/**
 * Set the supply of an existing SPL Mint account.
 * Returns `QUASAR_ERR_EXECUTION` if the account is missing or not a valid mint account.
 */
int32_t quasar_svm_set_mint_supply(QuasarSvm *svm, const uint8_t (*pubkey)[32], uint64_t supply);

/**
 * Execute multiple instructions as a single atomic transaction.
 *
 * `instructions` / `instructions_len`: count-prefixed serialized instructions.
 * `accounts` / `accounts_len`: serialized accounts (wire format).
 */
int32_t quasar_svm_process_transaction(QuasarSvm *svm,
                                       const uint8_t *instructions,
                                       uint64_t instructions_len,
                                       const uint8_t *accounts,
                                       uint64_t accounts_len,
                                       uint8_t **result_out,
                                       uint64_t *result_len_out);

/**
 * Execute multiple instructions without committing state changes (dry run).
 */
int32_t quasar_svm_simulate_transaction(QuasarSvm *svm,
                                        const uint8_t *instructions,
                                        uint64_t instructions_len,
                                        const uint8_t *accounts,
                                        uint64_t accounts_len,
                                        uint8_t **result_out,
                                        uint64_t *result_len_out);

/**
 * Free a serialized result buffer previously returned by an execution function.
 * Both the pointer and the length from the execution call must be provided.
 */
void quasar_result_free(uint8_t *result, uint64_t result_len);

#endif  /* QUASAR_SVM_H */
