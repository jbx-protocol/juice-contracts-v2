// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';

import './abstract/JBOperatable.sol';
import './interfaces/IJBProjects.sol';

import './libraries/JBOperations.sol';
import './libraries/JBErrors.sol';

/**
@dev Custom Errors to replace the require statement and save gas
*/
error EMPTY_HANDLE();
error HANDLE_TAKEN();
error HANDLE_NOT_TAKEN();
error CHALLENGE_OPEN();
/** 
  @notice 
  Stores project ownership and identifying information.

  @dev
  Projects are represented as ERC-721's.
*/
contract JBProjects is ERC721, IJBProjects, JBOperatable {
  //*********************************************************************//
  // --------------------- private stored constants -------------------- //
  //*********************************************************************//

  /** 
    @notice
    The number of seconds in 365 days.
  */
  uint256 private constant _SECONDS_IN_YEAR = 31536000;

  //*********************************************************************//
  // --------------------- public stored properties -------------------- //
  //*********************************************************************//

  /** 
    @notice 
    The number of projects that have been created using this contract.

    @dev
    The count is incremented with each new project created. 
    The resulting ERC-721 token ID for each project is the newly incremented count value.
  */
  uint256 public override count = 0;

  /** 
    @notice 
    The IPFS CID for each project, which can be used to reference the project's metadata.

    @dev
    This is optional for each project.

    _projectId The ID of the project to which the URI belongs.
  */
  mapping(uint256 => string) public override metadataCidOf;

  /** 
    @notice 
    The unique handle for each project.

    @dev
    Each project must have a handle.

    _projectId The ID of the project to which the handle belongs.
  */
  mapping(uint256 => bytes32) public override handleOf;

  /** 
    @notice 
    The ID of the project that each unique handle is currently referencing.

    _handle The handle from which the project ID can be referenced.
  */
  mapping(bytes32 => uint256) public override idFor;

  /** 
    @notice 
    The address that can reallocate a handle that have been transferred to it.

    _handle The handle to look for the transfer address for.
  */
  mapping(bytes32 => address) public override transferAddressFor;

  /** 
    @notice 
    The timestamps after which each handle can be openly claimed. 

    @dev
    A value of 0 means a handle isn't yet being challenged.

    _handle The handle to look for the challenge expiry of.
  */
  mapping(bytes32 => uint256) public override challengeExpiryOf;

  //*********************************************************************//
  // -------------------------- constructor ---------------------------- //
  //*********************************************************************//

  /** 
    @param _operatorStore A contract storing operator assignments.
  */
  constructor(IJBOperatorStore _operatorStore)
    ERC721('Juicebox project', 'JUICEBOX')
    JBOperatable(_operatorStore)
  {}

  //*********************************************************************//
  // ---------------------- external transactions ---------------------- //
  //*********************************************************************//

  /**
    @notice 
    Create a new project for the specified owner, which mints an NFT (ERC-721) into their wallet.

    @dev 
    Anyone can create a project on an owner's behalf.

    @param _owner The address that will be the owner of the project.
    @param _handle A unique string to associate with the project that will resolve to its token ID.
    @param _metadataCid An IPFS CID hash where metadata about the project has been uploaded. An empty string is acceptable if no metadata is being provided.

    @return The token ID of the newly created project
  */
  function createFor(
    address _owner,
    bytes32 _handle,
    string calldata _metadataCid
  ) external override returns (uint256) {
    // Handle must exist.
    if (_handle == bytes32(0)) {
      revert EMPTY_HANDLE();
    }

    // Handle must be unique.
    if (!(idFor[_handle] == 0 && transferAddressFor[_handle] == address(0))) {
      revert HANDLE_TAKEN();
    }

    // Increment the count, which will be used as the ID.
    count++;

    // Mint the project.
    _safeMint(_owner, count);

    // Store the handle for the project ID.
    handleOf[count] = _handle;

    // Store the project ID for the handle.
    idFor[_handle] = count;

    // Set the URI if one was provided.
    if (bytes(_metadataCid).length > 0) metadataCidOf[count] = _metadataCid;

    emit Create(count, _owner, _handle, _metadataCid, msg.sender);

    return count;
  }

  /**
    @notice 
    Allows a project owner to set the project's handle.

    @dev 
    Only a project's owner or operator can set its handle.

    @param _projectId The ID of the project who's handle is being changed.
    @param _handle The new unique handle for the project.
  */
  function setHandleOf(uint256 _projectId, bytes32 _handle)
    external
    override
    requirePermission(ownerOf(_projectId), _projectId, JBOperations.SET_HANDLE)
  {
    // Handle must exist.
    if (_handle == bytes32(0)) {
      revert EMPTY_HANDLE();
    }
    // Handle must be unique.
    if (!(idFor[_handle] == 0 && transferAddressFor[_handle] == address(0))) {
      revert HANDLE_TAKEN();
    }

    // Register the change in the resolver.
    idFor[handleOf[_projectId]] = 0;

    // Store the handle for the project ID.
    handleOf[_projectId] = _handle;

    // Store the project ID for the handle.
    idFor[_handle] = _projectId;

    emit SetHandle(_projectId, _handle, msg.sender);
  }

  /**
    @notice 
    Allows a project owner to set the project's IPFS CID hash where metadata about the project has been uploaded.

    @dev 
    Only a project's owner or operator can set its URI.

    @param _projectId The ID of the project who's URI is being changed.
    @param _metadataCid The new IPFS CID hash where metadata about the project has been uploaded.

  */
  function setMetadataCidOf(uint256 _projectId, string calldata _metadataCid)
    external
    override
    requirePermission(ownerOf(_projectId), _projectId, JBOperations.SET_METADATA_CID)
  {
    // Set the new uri.
    metadataCidOf[_projectId] = _metadataCid;

    emit SetUri(_projectId, _metadataCid, msg.sender);
  }

  /**
    @notice 
    Allows a project owner to transfer its handle to another address.

    @dev 
    Only a project's owner or operator can transfer its handle.

    @param _projectId The ID of the project to transfer the handle from.
    @param _transferAddress The address that should be able to reallocate the transferred handle.
    @param _newHandle The new unique handle for the project that will replace the transferred one.

    @return handle The handle that has been transferred.
  */
  function transferHandleOf(
    uint256 _projectId,
    address _transferAddress,
    bytes32 _newHandle
  )
    external
    override
    requirePermission(ownerOf(_projectId), _projectId, JBOperations.SET_HANDLE)
    returns (bytes32 handle)
  {
    // A new handle must have been provided.
    if (_newHandle == bytes32(0)) {
      revert EMPTY_HANDLE();
    }

    // The new handle must be available.
    if (!(idFor[_newHandle] == 0 && transferAddressFor[_newHandle] == address(0))) {
      revert HANDLE_TAKEN();
    }

    // Get a reference to the project's current handle.
    handle = handleOf[_projectId];

    // Remove the project ID for the transferred handle.
    idFor[handle] = 0;

    // Store the new handle for the project ID.
    idFor[_newHandle] = _projectId;

    // Store the project ID for the new handle.
    handleOf[_projectId] = _newHandle;

    // Give the address the power to transfer the current handle.
    transferAddressFor[handle] = _transferAddress;

    emit TransferHandle(_projectId, _transferAddress, handle, _newHandle, msg.sender);
  }

  /**
    @notice 
    Allows an address to claim an handle that has been transferred to it, and apply it to a project of theirs.
    A handle can also be claimed if it has been challenged and the challenge has succeeded.

    @dev 
    Only a project's owner or operator can claim a handle for it.

    @param _handle The handle being claimed.
    @param _transferAddress The address to which the handle has been transferred, which can now assign the handle to a project.
    @param _projectId The ID of the project to assign to the claimed handle.
  */
  function claimHandle(
    bytes32 _handle,
    address _transferAddress,
    uint256 _projectId
  )
    external
    override
    requirePermission(_transferAddress, _projectId, JBOperations.CLAIM_HANDLE)
    requirePermission(ownerOf(_projectId), _projectId, JBOperations.CLAIM_HANDLE)
  {
    // The handle must have been transferred to the specified address,
    // or the handle challenge must have expired before being renewed.
    if (
      transferAddressFor[_handle] != _transferAddress ||
      (challengeExpiryOf[_handle] <= 0 && block.timestamp <= challengeExpiryOf[_handle])
    ) {
      revert JBErrors.UNAUTHORIZED();
    }

    // Remove the project ID for the current handle of the specified project.
    idFor[handleOf[_projectId]] = 0;

    // Set the project ID for the provided handle to be the specified project.
    idFor[_handle] = _projectId;

    // Set the new handle.
    handleOf[_projectId] = _handle;

    // Set the handle as not being transferred.
    transferAddressFor[_handle] = address(0);

    // Reset the challenge to 0.
    challengeExpiryOf[_handle] = 0;

    emit ClaimHandle(_projectId, _transferAddress, _handle, msg.sender);
  }

  /** 
    @notice
    Allows anyone to challenge a project's handle. After one year, the handle can be claimed by anyone if the challenge isn't answered by the handle's project.
    This can be used to make sure a handle belonging to a stale project isn't lost forever.

    @param _handle The handle to challenge.
  */
  function challengeHandle(bytes32 _handle) external override {
    // Get a reference to the ID of the project to which the handle belongs.
    uint256 _projectId = idFor[_handle];

    // No need to challenge a handle that's not taken.
    if (_projectId == 0) {
      revert HANDLE_NOT_TAKEN();
    }

    // No need to challenge again if a handle is already being challenged.
    if (challengeExpiryOf[_handle] != 0) {
      revert CHALLENGE_OPEN();
    }

    // The challenge will expire in a year, at which point the handle can be claimed if it has yet to be renewed.
    uint256 _challengeExpiry = block.timestamp + _SECONDS_IN_YEAR;

    // Store the challenge expiry for the handle.
    challengeExpiryOf[_handle] = _challengeExpiry;

    emit ChallengeHandle(_handle, _projectId, _challengeExpiry, msg.sender);
  }

  /** 
    @notice
    Allows a project to renew its handle, which cancels any pending challenges.

    @dev 
    Only a project's owner or operator can renew its handle.

    @param _projectId The ID of the project to which the handle being renewed belongs. 
  */
  function renewHandleOf(uint256 _projectId)
    external
    override
    requirePermission(ownerOf(_projectId), _projectId, JBOperations.RENEW_HANDLE)
  {
    // Get the handle of the project.
    bytes32 _handle = handleOf[_projectId];

    // Reset the challenge to 0.
    challengeExpiryOf[_handle] = 0;

    emit RenewHandle(_handle, _projectId, msg.sender);
  }
}
