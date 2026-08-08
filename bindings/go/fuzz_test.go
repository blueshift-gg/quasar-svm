package quasarsvm

import "testing"

// FuzzDeserializeResult feeds arbitrary bytes into the wire format parser.
// It should never panic — only return errors on malformed input.
func FuzzDeserializeResult(f *testing.F) {
	// Seed with a minimal valid result: status=0, cu=0, time=0,
	// return_data_len=0, num_accounts=0, num_logs=0, error_msg_len=0,
	// num_pre_balances=0, num_post_balances=0, num_pre_token_balances=0,
	// num_post_token_balances=0, num_trace_instructions=0
	f.Add([]byte{
		0, 0, 0, 0, // status: 0 (success)
		0, 0, 0, 0, 0, 0, 0, 0, // compute_units: 0
		0, 0, 0, 0, 0, 0, 0, 0, // execution_time_us: 0
		0, 0, 0, 0, // return_data_len: 0
		0, 0, 0, 0, // num_accounts: 0
		0, 0, 0, 0, // num_logs: 0
		0, 0, 0, 0, // error_message_len: 0
		0, 0, 0, 0, // num_pre_balances: 0
		0, 0, 0, 0, // num_post_balances: 0
		0, 0, 0, 0, // num_pre_token_balances: 0
		0, 0, 0, 0, // num_post_token_balances: 0
		0, 0, 0, 0, // num_trace_instructions: 0
	})

	// Empty input
	f.Add([]byte{})

	// Truncated header
	f.Add([]byte{1, 0, 0, 0})

	f.Fuzz(func(t *testing.T, data []byte) {
		// Must not panic — errors are fine.
		result, err := deserializeResult(data)
		if err != nil {
			return
		}
		// If parsing succeeded, basic invariants should hold.
		if result == nil {
			t.Fatal("nil result without error")
		}
	})
}
