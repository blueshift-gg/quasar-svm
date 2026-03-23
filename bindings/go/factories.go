package quasarsvm

import (
	"encoding/binary"

	"github.com/gagliardetto/solana-go"
)

// NewSystemAccount creates a system-owned account with the given lamports.
func NewSystemAccount(address solana.PublicKey, lamports uint64) Account {
	return Account{
		Address:  address,
		Owner:    solana.SystemProgramID,
		Lamports: lamports,
	}
}

// MintConfig specifies parameters for creating a mint account.
type MintConfig struct {
	MintAuthority   *solana.PublicKey
	Supply          uint64
	Decimals        uint8
	FreezeAuthority *solana.PublicKey
}

// NewMintAccount creates a SPL Token mint account.
func NewMintAccount(address solana.PublicKey, cfg MintConfig) Account {
	return newMintAccountWithProgram(address, cfg, solana.TokenProgramID)
}

// NewMintAccount2022 creates a SPL Token-2022 mint account.
func NewMintAccount2022(address solana.PublicKey, cfg MintConfig) Account {
	return newMintAccountWithProgram(address, cfg, solana.Token2022ProgramID)
}

func newMintAccountWithProgram(address solana.PublicKey, cfg MintConfig, tokenProgram solana.PublicKey) Account {
	// SPL Token Mint layout: 82 bytes
	// [4] mint_authority COption<Pubkey> (4 tag + 32 key)
	// [8] supply (u64 LE)
	// [1] decimals
	// [1] is_initialized
	// [4] freeze_authority COption<Pubkey> (4 tag + 32 key)
	data := make([]byte, 82)
	off := 0

	// Mint authority (COption<Pubkey>)
	if cfg.MintAuthority != nil {
		binary.LittleEndian.PutUint32(data[off:], 1) // Some
		off += 4
		copy(data[off:], cfg.MintAuthority[:])
		off += 32
	} else {
		binary.LittleEndian.PutUint32(data[off:], 0) // None
		off += 4 + 32
	}

	// Supply
	binary.LittleEndian.PutUint64(data[off:], cfg.Supply)
	off += 8

	// Decimals
	data[off] = cfg.Decimals
	off++

	// is_initialized
	data[off] = 1
	off++

	// Freeze authority (COption<Pubkey>)
	if cfg.FreezeAuthority != nil {
		binary.LittleEndian.PutUint32(data[off:], 1)
		off += 4
		copy(data[off:], cfg.FreezeAuthority[:])
	} else {
		binary.LittleEndian.PutUint32(data[off:], 0)
	}

	// Minimum rent-exempt balance for 82 bytes
	lamports := rentMinimumBalance(82)

	return Account{
		Address:  address,
		Owner:    tokenProgram,
		Lamports: lamports,
		Data:     data,
	}
}

// TokenAccountConfig specifies parameters for creating a token account.
type TokenAccountConfig struct {
	Mint   solana.PublicKey
	Owner  solana.PublicKey
	Amount uint64
}

// NewTokenAccount creates a SPL Token account.
func NewTokenAccount(address solana.PublicKey, cfg TokenAccountConfig) Account {
	return newTokenAccountWithProgram(address, cfg, solana.TokenProgramID)
}

// NewTokenAccount2022 creates a SPL Token-2022 token account.
func NewTokenAccount2022(address solana.PublicKey, cfg TokenAccountConfig) Account {
	return newTokenAccountWithProgram(address, cfg, solana.Token2022ProgramID)
}

func newTokenAccountWithProgram(address solana.PublicKey, cfg TokenAccountConfig, tokenProgram solana.PublicKey) Account {
	// SPL Token Account layout: 165 bytes
	// [32] mint
	// [32] owner
	// [8]  amount (u64 LE)
	// [4+32] delegate COption<Pubkey>
	// [1]  state (AccountState: 1 = Initialized)
	// [4+8] is_native COption<u64>
	// [8]  delegated_amount
	// [4+32] close_authority COption<Pubkey>
	data := make([]byte, 165)
	off := 0

	// Mint
	copy(data[off:], cfg.Mint[:])
	off += 32

	// Owner
	copy(data[off:], cfg.Owner[:])
	off += 32

	// Amount
	binary.LittleEndian.PutUint64(data[off:], cfg.Amount)
	off += 8

	// Delegate: None
	off += 4 + 32

	// State: Initialized
	data[off] = 1
	off++

	// is_native: None
	off += 4 + 8

	// delegated_amount: 0 (already zeroed)
	// close_authority: None (already zeroed)

	lamports := rentMinimumBalance(165)

	return Account{
		Address:  address,
		Owner:    tokenProgram,
		Lamports: lamports,
		Data:     data,
	}
}

// rentMinimumBalance returns the minimum rent-exempt balance for an account of the given size.
// Uses Solana mainnet defaults: 3480 lamports/byte-year, exemption threshold 2 years.
func rentMinimumBalance(dataLen uint64) uint64 {
	const lamportsPerByteYear uint64 = 3480
	const exemptionYears uint64 = 2
	const accountStorageOverhead uint64 = 128
	accountSize := dataLen + accountStorageOverhead
	return accountSize * lamportsPerByteYear * exemptionYears
}
