// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';

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
contract JBProjects is ERC721, IJBProjects, JBOperatable {
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
    @param _metadataCid An IPFS CID hash where metadata about the project has been uploaded. An empty string is acceptable if no metadata is being provided.

    @return The token ID of the newly created project
  */
  function createFor(address _owner, string calldata _metadataCid)
    external
    override
    returns (uint256)
  {
    // Increment the count, which will be used as the ID.
    count++;

    // Mint the project.
    _safeMint(_owner, count);

    // Set the URI if one was provided.
    if (bytes(_metadataCid).length > 0) metadataCidOf[count] = _metadataCid;

    emit Create(count, _owner, _metadataCid, msg.sender);

    return count;
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
}
