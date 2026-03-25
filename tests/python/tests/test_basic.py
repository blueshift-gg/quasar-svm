"""Basic QuasarSVM tests."""
import pytest
from pathlib import Path

# TODO: Import from local quasar_svm once Python bindings are ready
# from quasar_svm import QuasarSvm


class TestSvmInitialization:
    """Test SVM initialization and basic operations."""

    @pytest.mark.skip(reason="Waiting for Python bindings implementation")
    def test_svm_init(self):
        """Test that SVM initializes successfully."""
        # svm = QuasarSvm()
        # assert svm is not None
        pass

    @pytest.mark.skip(reason="Waiting for Python bindings implementation")
    def test_svm_context_manager(self):
        """Test that SVM works as context manager."""
        # with QuasarSvm() as svm:
        #     assert svm is not None
        pass


class TestProgramLoading:
    """Test loading custom programs."""

    @pytest.mark.skip(reason="Waiting for test program")
    def test_load_program(self, load_test_program):
        """Test loading a custom program."""
        # from quasar_svm import QuasarSvm
        # from solders.pubkey import Pubkey

        # svm = QuasarSvm()
        # program_id = Pubkey.new_unique()
        # elf = load_test_program("test_program.so")

        # svm.add_program(program_id, elf, loader_version=3)
        pass

    @pytest.mark.skip(reason="Waiting for test program")
    def test_execute_instruction(self, load_test_program):
        """Test executing an instruction."""
        # from quasar_svm import QuasarSvm, KeyedAccount
        # from solders.pubkey import Pubkey
        # from solders.instruction import Instruction, AccountMeta

        # svm = QuasarSvm()
        # program_id = Pubkey.new_unique()
        # elf = load_test_program("test_program.so")
        # svm.add_program(program_id, elf, loader_version=3)

        # # Create test account
        # account_key = Pubkey.new_unique()
        # account = KeyedAccount(
        #     address=account_key,
        #     owner=program_id,
        #     lamports=1_000_000_000,
        #     data=bytes(32),
        #     executable=False,
        # )

        # # Create instruction
        # instruction = Instruction(
        #     program_id=program_id,
        #     accounts=[AccountMeta(account_key, is_signer=False, is_writable=True)],
        #     data=bytes([0]),
        # )

        # # Execute
        # result = svm.process_instruction(instruction, [account])
        # assert result.is_success()
        pass


class TestAccountManagement:
    """Test account creation and management."""

    @pytest.mark.skip(reason="Waiting for Python bindings implementation")
    def test_create_account(self):
        """Test creating accounts."""
        # TODO: Test account creation
        pass

    @pytest.mark.skip(reason="Waiting for Python bindings implementation")
    def test_modify_account(self):
        """Test modifying accounts."""
        # TODO: Test account modification
        pass
