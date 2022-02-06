// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC721/extensions/draft-ERC721Votes.sol';

import './abstract/JBOperatable.sol';
import './interfaces/IJBProjects.sol';
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
    The metadata for each project, which can be used across several domains.

    _projectId The ID of the project to which the metadata belongs.
    _domain The domain within which the metadata applies.
  */
  mapping(uint256 => mapping(uint256 => string)) public override metadataContentOf;

  /**
    @notice
    The contract resolving each project ID to its ERC721 URI.
  */
  IJBTokenUriResolver public override tokenUriResolver;

  //*********************************************************************//
  // -------------------------- constructor ---------------------------- //
  //*********************************************************************//

  /** 
    @param _operatorStore A contract storing operator assignments.
  */
  constructor(IJBOperatorStore _operatorStore)
    ERC721('Juicebox Projects', 'JUICEBOX')
    EIP712('Juicebox Projects', '1')
    JBOperatable(_operatorStore)
  // solhint-disable-next-line no-empty-blocks
  {

  }

  //*********************************************************************//
  // ---------------------- external transactions ---------------------- //
  //*********************************************************************//

  /**
    @notice 
    Create a new project for the specified owner, which mints an NFT (ERC-721) into their wallet.

    @dev 
    Anyone can create a project on an owner's behalf.

    @param _owner The address that will be the owner of the project.
    @param _metadata A struct containing metadata content about the project, and domain within which the metadata applies. An empty string is acceptable if no metadata is being provided.

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

    // Set the metadata if one was provided.
    if (bytes(_metadata.content).length > 0)
      metadataContentOf[count][_metadata.domain] = _metadata.content;

    emit Create(count, _owner, _metadata, msg.sender);

    return count;
  }

  /**
    @notice 
    Allows a project owner to set the project's metadata content for a particular domain namespace. 

    @dev 
    Only a project's owner or operator can set its metadata.

    @param _projectId The ID of the project who's metadata is being changed.
    @param _metadata A struct containing metadata content, and domain within which the metadata applies. An empty string is acceptable if no metadata is being provided.
  */
  function setMetadataOf(uint256 _projectId, JBProjectMetadata calldata _metadata)
    external
    override
    requirePermission(ownerOf(_projectId), _projectId, JBOperations.SET_METADATA)
  {
    // Set the new uri within the specified domain.
    metadataContentOf[_projectId][_metadata.domain] = _metadata.content;

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
    if (tokenUriResolver == IJBTokenUriResolver(address(0))) return '';
    return tokenUriResolver.getUri(_projectId);
  }

  /**
    @notice 
    Set the address of the IJBTokenUriResolver used to retrieve the tokenURI of projects.

    @param _newResolver The address of the new resolver.
  */
  function setTokenUriResolver(IJBTokenUriResolver _newResolver) external override onlyOwner {
    tokenUriResolver = _newResolver;
    emit SetTokenUriResolver(_newResolver, msg.sender);
  }
}
