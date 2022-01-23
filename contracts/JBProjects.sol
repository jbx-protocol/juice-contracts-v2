// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC721/extensions/draft-ERC721Votes.sol';

import './abstract/JBOperatable.sol';
import './interfaces/IJBProjects.sol';
import './interfaces/IJBTokenUriResolver.sol';
import './libraries/JBOperations.sol';

/**
  Note: these contracts do not include a naming system for projects, because we hope to use ENS' record system
  to connect names with projects. 

 */

/** 
  @notice 
  Stores project ownership and identifying information.

  @dev
  Projects are represented as ERC-721's.
*/

contract JBProjects is ERC721Votes, Ownable, IJBProjects, JBOperatable {
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
    The contract resolving each project id to its ERC721 URI (as an IPFS CID)
    
    @dev
    This is optional for each project
  */
  IJBTokenUriResolver public uriResolver;

  /** 
    @notice 
    The IPFS CID for each project, which can be used to reference the project's metadata.

    @dev
    This is optional for each project.

    _projectId The ID of the project to which the URI belongs.
    _domain The domain within which the metadata applies.
  */
  mapping(uint256 => mapping(uint256 => string)) public override metadataCidOf;

  //*********************************************************************//
  // -------------------------- constructor ---------------------------- //
  //*********************************************************************//

  /** 
    @param _operatorStore A contract storing operator assignments.
  */
  constructor(IJBOperatorStore _operatorStore)
    ERC721('Juicebox Projects', 'JUICEBOX')
    EIP712('Juicebox Projects', 'V2')
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
    @param _metadata A struct containing an IPFS CID hash where metadata about the project has been uploaded, and domain within which the metadata applies. An empty string is acceptable if no metadata is being provided.

    @return The token ID of the newly created project
  */
  function createFor(address _owner, JBProjectMetadata calldata _metadata)
    external
    override
    returns (uint256)
  {
    // Increment the count, which will be used as the ID.
    count++;

    // Mint the project.
    _safeMint(_owner, count);

    // Set the URI if one was provided.
    if (bytes(_metadata.cid).length > 0) metadataCidOf[count][_metadata.domain] = _metadata.cid;

    emit Create(count, _owner, _metadata, msg.sender);

    return count;
  }

  /**
    @notice 
    Allows a project owner to set the project's IPFS CID hash where metadata about the project has been uploaded.

    @dev 
    Only a project's owner or operator can set its metadata.

    @param _projectId The ID of the project who's URI is being changed.
    @param _metadata A struct containing an IPFS CID hash where metadata about the project has been uploaded, and domain within which the metadata applies. An empty string is acceptable if no metadata is being provided.
  */
  function setMetadataOf(uint256 _projectId, JBProjectMetadata calldata _metadata)
    external
    override
    requirePermission(ownerOf(_projectId), _projectId, JBOperations.SET_METADATA)
  {
    // Set the new uri within the specified domain.
    metadataCidOf[_projectId][_metadata.domain] = _metadata.cid;

    emit SetMetadata(_projectId, _metadata, msg.sender);
  }

  /**
    @notice 
    Returns the URI where the ERC-721 standard JSON of a project is hosted.

    @dev 
    this is optional for every project

    @param _projectId The ID of the project.
  */
  function tokenURI(uint256 _projectId) public view override returns (string memory) {
    if (uriResolver == IJBTokenUriResolver(address(0))) return '';

    return uriResolver.getUri(_projectId);
  }

  /**
    @notice 
    Set the address of the IJBTokenUriResolver used to retrieve the tokenURI of projects

    @param _newResolver The address of the new resolver.
  */
  function setTokenUriResolver(IJBTokenUriResolver _newResolver) external override onlyOwner {
    uriResolver = _newResolver;
    emit SetJBTokenUriResolver(_newResolver);
  }
}
