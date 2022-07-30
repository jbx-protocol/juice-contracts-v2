if [[ "$1" ]]
then
    RULE="--rule $1"
fi

# Get the absolute paths so this script can be run from anywhere
SCRIPT=$(readlink -f "$0")
SCRIPTPATH=$(dirname "$SCRIPT")

# Run the proofer in the top level directory and use foundry mappings
(
    cd "${SCRIPTPATH}/../" &&
    certoraRun \
        ./contracts/JBTokenStore.sol:JBTokenStore \
        ./contracts/JBOperatorStore.sol:JBOperatorStore \
        ./contracts/JBController.sol:JBController \
        ./contracts/JBDirectory.sol:JBDirectory \
        ./contracts/JBToken.sol:JBToken \
      --link \
        JBTokenStore:operatorStore=JBOperatorStore \
        JBTokenStore:directory=JBDirectory \
      --verify JBTokenStore:cvl/specs/JBTokenStore.spec \
      $RULE \
      --solc solc \
      --optimistic_loop \
      --send_only \
      --cloud \
      --msg "JBX: JBTokenStore $1" \
      --packages $(< ./remappings.txt)
)

# certoraRun ../contracts/JBTokenStore.sol:JBTokenStore \
#     --verify JBTokenStore:specs/JBTokenStore.spec \
#     --packages $(< ../remappings.txt)
#     $RULE \
#     --solc solc \
#     --optimistic_loop \
#     --send_only \
#     --cloud \
#     --msg "JBX: JBTokenStore $1"

# certoraRun ./harnass/JBOperatorStoreHarnass.sol:JBOperatorStoreHarnass \
#     --verify JBOperatorStoreHarnass:specs/JBOperatorStore.spec \
#     $RULE \
#     --solc solc \
#     --optimistic_loop \
#     --send_only \
#     --cloud \
#     --msg "JBX: JBOperatorStore $1"
