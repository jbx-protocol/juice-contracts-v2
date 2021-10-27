// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@paulrberg/contracts/math/PRBMath.sol';

import './interfaces/IJBFundingCycleStore.sol';
import './abstract/JBControllerUtility.sol';

/** 
  @notice 
  Manages funding cycle configurations, accounting, and scheduling.
*/
contract JBFundingCycleStore is JBControllerUtility, IJBFundingCycleStore {
  //*********************************************************************//
  // --------------------- private stored constants -------------------- //
  //*********************************************************************//

  /** 
    @notice 
    The number of seconds in a day.
  */
  uint256 private constant _SECONDS_IN_DAY = 86400;

  //*********************************************************************//
  // --------------------- private stored properties ------------------- //
  //*********************************************************************//

  /** 
    @notice
    Stores the reconfiguration properties of each funding cycle, packed into one storage slot.

    [_projectId]
  */
  mapping(uint256 => uint256) private _packedConfigurationPropertiesOf;

  /** 
    @notice
    Stores the properties added by the mechanism to manage and schedule each funding cycle, packed into one storage slot.
    
    [_projectId]
  */
  mapping(uint256 => uint256) private _packedIntrinsicPropertiesOf;

  /** 
    @notice
    Stores the metadata for each funding cycle, packed into one storage slot.

    [_projectId]
  */
  mapping(uint256 => uint256) private _metadataOf;

  /** 
    @notice
    Stores the amount that each funding cycle can tap funding cycle.

    [_projectId]
  */
  mapping(uint256 => uint256) private _targetOf;

  /** 
    @notice
    Stores the amount that has been tapped within each funding cycle.

    [_projectId]
  */
  mapping(uint256 => uint256) private _tappedAmountOf;

  //*********************************************************************//
  // --------------------- public stored properties -------------------- //
  //*********************************************************************//

  /** 
    @notice 
    The ID of the latest funding cycle for each project.
  */
  mapping(uint256 => uint256) public override latestIdOf;

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  /**
    @notice 
    Get the funding cycle with the given ID.

    @param _fundingCycleId The ID of the funding cycle to get.

    @return fundingCycle The funding cycle.
  */
  function get(uint256 _fundingCycleId)
    external
    view
    override
    returns (JBFundingCycle memory fundingCycle)
  {
    // The funding cycle should exist.
    require(_fundingCycleId > 0, '0x13 BAD_ID');

    // See if there's stored info for the provided ID.
    fundingCycle = _getStructFor(_fundingCycleId);

    // If so, return it.
    if (fundingCycle.number > 0) return fundingCycle;

    // Get the current funding cycle. It might exist but not yet have been stored.
    fundingCycle = currentOf(_fundingCycleId);

    // If the IDs match, return it.
    if (fundingCycle.id == _fundingCycleId) return fundingCycle;

    // Get the queued funding cycle. It might exist but not yet have been stored.
    fundingCycle = queuedOf(_fundingCycleId);

    // If the IDs match, return it.
    if (fundingCycle.id == _fundingCycleId) return fundingCycle;

    // Return an empty Funding Cycle.
    return _getStructFor(0);
  }

  /**
    @notice 
    The funding cycle that's next up for the specified project.

    @dev
    Returns an empty funding cycle with an ID of 0 if a queued funding cycle of the project is not found.

    @dev 
    This runs roughly similar logic to `_configurableOf`.

    @param _projectId The ID of the project to get the queued funding cycle of.

    @return _fundingCycle The queued funding cycle.
  */
  function queuedOf(uint256 _projectId) public view override returns (JBFundingCycle memory) {
    // The project must have funding cycles.
    if (latestIdOf[_projectId] == 0) return _getStructFor(0);

    // Get a reference to the standby funding cycle.
    uint256 _fundingCycleId = _standbyOf(_projectId);

    // If it exists, return it.
    if (_fundingCycleId > 0) return _getStructFor(_fundingCycleId);

    // Get a reference to the latest stored funding cycle for the project.
    _fundingCycleId = latestIdOf[_projectId];

    // Get the necessary properties for the standby funding cycle.
    JBFundingCycle memory _fundingCycle = _getStructFor(_fundingCycleId);

    // There's no queued if the current has a duration of 0.
    if (_fundingCycle.duration == 0) return _getStructFor(0);

    // Check to see if the correct ballot is approved for this funding cycle.
    // If so, return a funding cycle based on it.
    if (_isApproved(_fundingCycle)) return _mockFundingCycleBasedOn(_fundingCycle, false);

    // If it hasn't been approved, set the ID to be its base funding cycle, which carries the last approved configuration.
    _fundingCycleId = _fundingCycle.basedOn;

    // A funding cycle must exist.
    if (_fundingCycleId == 0) return _getStructFor(0);

    // Return a mock of what its second next up funding cycle would be.
    // Use second next because the next would be a mock of the current funding cycle.
    return _mockFundingCycleBasedOn(_getStructFor(_fundingCycleId), false);
  }

  /**
    @notice 
    The funding cycle that is currently active for the specified project.

    @dev
    Returns an empty funding cycle with an ID of 0 if a current funding cycle of the project is not found.

    @dev 
    This runs very similar logic to `_tappableOf`.

    @param _projectId The ID of the project to get the current funding cycle of.

    @return fundingCycle The current funding cycle.
  */
  function currentOf(uint256 _projectId)
    public
    view
    override
    returns (JBFundingCycle memory fundingCycle)
  {
    // The project must have funding cycles.
    if (latestIdOf[_projectId] == 0) return _getStructFor(0);

    // Check for an eligible funding cycle.
    uint256 _fundingCycleId = _eligibleOf(_projectId);

    // If no active funding cycle is found, check if there is a standby funding cycle.
    // If one exists, it will become active one it has been tapped.
    if (_fundingCycleId == 0) _fundingCycleId = _standbyOf(_projectId);

    // Keep a reference to the eligible funding cycle.
    JBFundingCycle memory _fundingCycle;

    // If a standby funding cycle exists...
    if (_fundingCycleId > 0) {
      // Get the necessary properties for the standby funding cycle.
      _fundingCycle = _getStructFor(_fundingCycleId);

      // Check to see if the correct ballot is approved for this funding cycle, and that it has started.
      if (_fundingCycle.start <= block.timestamp && _isApproved(_fundingCycle))
        return _fundingCycle;

      // If it hasn't been approved, set the ID to be the based funding cycle,
      // which carries the last approved configuration.
      _fundingCycleId = _fundingCycle.basedOn;
    } else {
      // No upcoming funding cycle found that is eligible to become active,
      // so us the ID of the latest active funding cycle, which carries the last configuration.
      _fundingCycleId = latestIdOf[_projectId];

      // Get the funding cycle for the latest ID.
      _fundingCycle = _getStructFor(_fundingCycleId);

      // If it's not approved, get a reference to the funding cycle that the latest is based on, which has the latest approved configuration.
      if (!_isApproved(_fundingCycle)) _fundingCycleId = _fundingCycle.basedOn;
    }

    // The funding cycle cant be 0.
    if (_fundingCycleId == 0) return _getStructFor(0);

    // The funding cycle to base a current one on.
    _fundingCycle = _getStructFor(_fundingCycleId);

    // Return a mock of what the next funding cycle would be like,
    // which would become active once it has been tapped.
    return _mockFundingCycleBasedOn(_fundingCycle, true);
  }

  /** 
    @notice 
    The currency ballot state of the project.

    @param _projectId The ID of the project to check the ballot state of.

    @return The current ballot's state.
  */
  function currentBallotStateOf(uint256 _projectId) external view override returns (JBBallotState) {
    // Get a reference to the latest funding cycle ID.
    uint256 _fundingCycleId = latestIdOf[_projectId];

    // The project must have funding cycles.
    require(_fundingCycleId > 0, '0x14: NOT_FOUND');

    // Get the necessary properties for the latest funding cycle.
    JBFundingCycle memory _fundingCycle = _getStructFor(_fundingCycleId);

    // If the latest funding cycle is the first, or if it has already started, it must be approved.
    if (_fundingCycle.basedOn == 0) return JBBallotState.Approved;

    return _ballotStateOf(_fundingCycleId, _fundingCycle.configured, _fundingCycle.basedOn);
  }

  //*********************************************************************//
  // -------------------------- constructor ---------------------------- //
  //*********************************************************************//

  /** 
    @param _directory A contract storing directories of terminals and controllers for each project.
  */
  constructor(IJBDirectory _directory) JBControllerUtility(_directory) {}

  //*********************************************************************//
  // ---------------------- external transactions ---------------------- //
  //*********************************************************************//

  /**
    @notice 
    Configures the next eligible funding cycle for the specified project.

    @dev
    Only a project's current controller can configure its funding cycles.

    @param _projectId The ID of the project being configured.
    @param _data The funding cycle configuration.
      @dev _data.target The amount that the project wants to receive in each funding cycle. 18 decimals.
      @dev _data.currency The currency of the `_target`. Send 0 for ETH or 1 for USD.
      @dev _data.duration The duration of the funding cycle for which the `_target` amount is needed. Measured in days. 
        Set to 0 for no expiry and to be able to reconfigure anytime.
      @dev _data.discountRate A number from 0-10000 indicating how valuable a contribution to this funding cycle is compared to previous funding cycles.
        If it's 0, each funding cycle will have equal weight.
        If the number is 9000, a contribution to the next funding cycle will only give you 10% of tickets given to a contribution of the same amoutn during the current funding cycle.
        If the number is 10001, an non-recurring funding cycle will get made.
      @dev _data.ballot The new ballot that will be used to approve subsequent reconfigurations.
    @param _metadata Data to associate with this funding cycle configuration.
    @param _fee The fee that this configuration incurs when tapping.

    @return The funding cycle that the configuration will take effect during.
  */
  function configureFor(
    uint256 _projectId,
    JBFundingCycleData calldata _data,
    uint256 _metadata,
    uint256 _fee
  ) external override onlyController(_projectId) returns (JBFundingCycle memory) {
    // Duration must fit in a uint16.
    require(_data.duration <= type(uint16).max, '0x15: BAD_DURATION');

    // Discount rate token must be less than or equal to 100%. A value of 10001 means non-recurring.
    require(_data.discountRate <= 10001, '0x16: BAD_DISCOUNT_RATE');

    // Currency must fit into a uint8.
    require(_data.currency <= type(uint8).max, '0x17: BAD_CURRENCY');

    // Weight must fit into a uint8.
    require(_data.weight <= type(uint80).max, '0x18: BAD_WEIGHT');

    // Fee must be less than or equal to 100%.
    require(_fee <= 200, '0x19: BAD_FEE');

    // Set the configuration timestamp is now.
    uint256 _configured = block.timestamp;

    // Gets the ID of the funding cycle to reconfigure.
    uint256 _fundingCycleId = _configurableOf(_projectId, _configured, _data.weight);

    // Store the configuration.
    _packAndStoreConfigurationPropertiesOf(
      _fundingCycleId,
      _configured,
      _data.ballot,
      _data.duration,
      _data.currency,
      _fee,
      _data.discountRate
    );

    // Set the target amount.
    _targetOf[_fundingCycleId] = _data.target;

    // Set the metadata.
    _metadataOf[_fundingCycleId] = _metadata;

    emit Configure(_fundingCycleId, _projectId, _configured, _data, _metadata, msg.sender);

    return _getStructFor(_fundingCycleId);
  }

  /** 
    @notice 
    Tap funds from a project's currently tappable funding cycle.

    @dev
    Only a project's current controller can tap funds for its funding cycles.

    @param _projectId The ID of the project being tapped.
    @param _amount The amount being tapped.

    @return The tapped funding cycle.
  */
  function tapFrom(uint256 _projectId, uint256 _amount)
    external
    override
    onlyController(_projectId)
    returns (JBFundingCycle memory)
  {
    // Amount must be positive.
    require(_amount > 0, '0x1a: INSUFFICIENT_FUNDS');

    // Get a reference to the funding cycle being tapped.
    uint256 _fundingCycleId = _tappableOf(_projectId);

    // The new amount that has been tapped.
    uint256 _newTappedAmount = _tappedAmountOf[_fundingCycleId] + _amount;

    // Amount must be within what is still tappable.
    require(_newTappedAmount <= _targetOf[_fundingCycleId], '0x1b: INSUFFICIENT_FUNDS');

    // Store the new amount.
    _tappedAmountOf[_fundingCycleId] = _newTappedAmount;

    emit Tap(_fundingCycleId, _projectId, _amount, _newTappedAmount, msg.sender);

    return _getStructFor(_fundingCycleId);
  }

  //*********************************************************************//
  // --------------------- private helper functions -------------------- //
  //*********************************************************************//

  /**
    @notice 
    Returns the configurable funding cycle for this project if it exists, otherwise creates one.

    @param _projectId The ID of the project to find a configurable funding cycle for.
    @param _configured The time at which the configuration is occurring.
    @param _weight The weight to store along with a newly created configurable funding cycle.

    @return fundingCycleId The ID of the configurable funding cycle.
  */
  function _configurableOf(
    uint256 _projectId,
    uint256 _configured,
    uint256 _weight
  ) private returns (uint256 fundingCycleId) {
    // If there's not yet a funding cycle for the project, return the ID of a newly created one.
    if (latestIdOf[_projectId] == 0)
      return _initFor(_projectId, _getStructFor(0), block.timestamp, _weight);

    // Get the standby funding cycle's ID.
    fundingCycleId = _standbyOf(_projectId);

    // If it exists, make sure its updated, then return it.
    if (fundingCycleId > 0) {
      // Get the funding cycle that the specified one is based on.
      JBFundingCycle memory _baseFundingCycle = _getStructFor(
        _getStructFor(fundingCycleId).basedOn
      );

      // The base's ballot must have ended.
      _updateFundingCycleBasedOn(
        _baseFundingCycle,
        _getLatestTimeAfterBallotOf(_baseFundingCycle, _configured),
        _weight
      );
      return fundingCycleId;
    }

    // Get the active funding cycle's ID.
    fundingCycleId = _eligibleOf(_projectId);

    // If the ID of an eligible funding cycle exists, it's approved, and active funding cycles are configurable, return it.
    if (fundingCycleId > 0) {
      if (!_isIdApproved(fundingCycleId)) {
        // If it hasn't been approved, set the ID to be the based funding cycle,
        // which carries the last approved configuration.
        fundingCycleId = _getStructFor(fundingCycleId).basedOn;
      }
    } else {
      // Get the ID of the latest funding cycle which has the latest reconfiguration.
      fundingCycleId = latestIdOf[_projectId];

      // If it hasn't been approved, set the ID to be the based funding cycle,
      // which carries the last approved configuration.
      if (!_isIdApproved(fundingCycleId)) fundingCycleId = _getStructFor(fundingCycleId).basedOn;
    }

    // Base off of the active funding cycle if it exists.
    JBFundingCycle memory _fundingCycle = _getStructFor(fundingCycleId);

    // Make sure the funding cycle is recurring.
    require(_fundingCycle.discountRate < 10001, '0x1c: NON_RECURRING');

    // Determine if the configurable funding cycle can only take effect on or after a certain date.
    uint256 _mustStartOnOrAfter;

    // The ballot must have ended.
    _mustStartOnOrAfter = _getLatestTimeAfterBallotOf(_fundingCycle, _configured);

    // Return the newly initialized configurable funding cycle.
    // No need to copy since a new configuration is going to be applied.
    fundingCycleId = _initFor(_projectId, _fundingCycle, _mustStartOnOrAfter, _weight);
  }

  /**
    @notice 
    Returns the funding cycle that can be tapped at the time of the call.

    @param _projectId The ID of the project to find a tappable funding cycle for.

    @return fundingCycleId The ID of the tappable funding cycle.
  */
  function _tappableOf(uint256 _projectId) private returns (uint256 fundingCycleId) {
    // Check for the ID of an eligible funding cycle.
    fundingCycleId = _eligibleOf(_projectId);

    // No eligible funding cycle found, check for the ID of a standby funding cycle.
    // If this one exists, it will become eligible one it has started.
    if (fundingCycleId == 0) fundingCycleId = _standbyOf(_projectId);

    // Keep a reference to the funding cycle eligible for being tappable.
    JBFundingCycle memory _fundingCycle;

    // If the ID of an eligible funding cycle exists,
    // check to see if it has been approved by the based funding cycle's ballot.
    if (fundingCycleId > 0) {
      // Get the necessary properties for the funding cycle.
      _fundingCycle = _getStructFor(fundingCycleId);

      // Check to see if the cycle is approved. If so, return it.
      if (_fundingCycle.start <= block.timestamp && _isApproved(_fundingCycle))
        return fundingCycleId;

      // If it hasn't been approved, set the ID to be the base funding cycle,
      // which carries the last approved configuration.
      fundingCycleId = _fundingCycle.basedOn;
    } else {
      // No upcoming funding cycle found that is eligible to become active, clone the latest active funding cycle.
      // which carries the last configuration.
      fundingCycleId = latestIdOf[_projectId];

      // Get the funding cycle for the latest ID.
      _fundingCycle = _getStructFor(fundingCycleId);

      // If it's not approved, get a reference to the funding cycle that the latest is based on, which has the latest approved configuration.
      if (!_isApproved(_fundingCycle)) fundingCycleId = _fundingCycle.basedOn;
    }

    // The funding cycle cant be 0.
    require(fundingCycleId > 0, '0x1d: NOT_FOUND');

    // Set the eligible funding cycle.
    _fundingCycle = _getStructFor(fundingCycleId);

    // Funding cycles with a discount rate of 100% are non-recurring.
    require(_fundingCycle.discountRate < 10001, '0x1e: NON_RECURRING');

    // The time when the funding cycle immediately after the eligible funding cycle starts.
    uint256 _nextImmediateStart = _fundingCycle.start + (_fundingCycle.duration * _SECONDS_IN_DAY);

    // The distance from now until the nearest past multiple of the cycle duration from its start.
    // A duration of zero means the reconfiguration can start right away.
    uint256 _timeFromImmediateStartMultiple = _fundingCycle.duration == 0
      ? 0
      : (block.timestamp - _nextImmediateStart) % (_fundingCycle.duration * _SECONDS_IN_DAY);

    // Return the tappable funding cycle.
    fundingCycleId = _initFor(
      _projectId,
      _fundingCycle,
      block.timestamp - _timeFromImmediateStartMultiple,
      0
    );

    // Copy the properties of the base funding cycle onto the new configuration efficiently.
    _packAndStoreConfigurationPropertiesOf(
      fundingCycleId,
      _fundingCycle.configured,
      _fundingCycle.ballot,
      _fundingCycle.duration,
      _fundingCycle.currency,
      _fundingCycle.fee,
      _fundingCycle.discountRate
    );

    _metadataOf[fundingCycleId] = _metadataOf[_fundingCycle.id];
    _targetOf[fundingCycleId] = _targetOf[_fundingCycle.id];
  }

  /**
    @notice 
    Initializes a funding cycle with the appropriate properties.

    @param _projectId The ID of the project to which the funding cycle being initialized belongs.
    @param _baseFundingCycle The funding cycle to base the initialized one on.
    @param _mustStartOnOrAfter The time before which the initialized funding cycle can't start.

    @return newFundingCycleId The ID of the initialized funding cycle.
  */
  function _initFor(
    uint256 _projectId,
    JBFundingCycle memory _baseFundingCycle,
    uint256 _mustStartOnOrAfter,
    uint256 _weight
  ) private returns (uint256 newFundingCycleId) {
    // If there is no base, initialize a first cycle.
    if (_baseFundingCycle.id == 0) {
      // The first number is 1.
      uint256 _number = 1;

      // Get the formatted ID.
      newFundingCycleId = _idFor(_projectId, _number);

      // Set fresh intrinsic properties.
      _packAndStoreIntrinsicPropertiesOf(
        _projectId,
        _number,
        _weight,
        _baseFundingCycle.id,
        block.timestamp
      );
    } else {
      // Update the intrinsic properties of the funding cycle being initialized.
      newFundingCycleId = _updateFundingCycleBasedOn(
        _baseFundingCycle,
        _mustStartOnOrAfter,
        _weight
      );
    }

    // Set the project's latest funding cycle ID to the new count.
    latestIdOf[_projectId] = newFundingCycleId;

    emit Init(newFundingCycleId, _projectId, _baseFundingCycle.id);
  }

  /** 
    @notice
    Updates intrinsic properties for a funding cycle given a base cycle.

    @param _baseFundingCycle The cycle that the one being updated is based on.
    @param _mustStartOnOrAfter The time before which the initialized funding cycle can't start.
    @param _weight The weight to store along with a newly updated configurable funding cycle.

    @return fundingCycleId The ID of the funding cycle that was updated.
  */
  function _updateFundingCycleBasedOn(
    JBFundingCycle memory _baseFundingCycle,
    uint256 _mustStartOnOrAfter,
    uint256 _weight
  ) private returns (uint256 fundingCycleId) {
    // Derive the correct next start time from the base.
    uint256 _start = _deriveStartFrom(_baseFundingCycle, _mustStartOnOrAfter);

    // A weight of 1 is treated as a weight of 0.
    _weight = _weight > 0
      ? (_weight == 1 ? 0 : _weight)
      : _deriveWeightFrom(_baseFundingCycle, _start);

    // Derive the correct number.
    uint256 _number = _deriveNumberFrom(_baseFundingCycle, _start);

    // Update the intrinsic properties.
    fundingCycleId = _packAndStoreIntrinsicPropertiesOf(
      _baseFundingCycle.projectId,
      _number,
      _weight,
      _baseFundingCycle.id,
      _start
    );
  }

  /**
    @notice 
    Efficiently stores a funding cycle's provided intrinsic properties.

    @param _projectId The ID of the project to which the funding cycle belongs.
    @param _number The number of the funding cycle.
    @param _weight The weight of the funding cycle.
    @param _basedOn The ID of the based funding cycle.
    @param _start The start time of this funding cycle.

    @return fundingCycleId The ID of the funding cycle that was updated.
  */
  function _packAndStoreIntrinsicPropertiesOf(
    uint256 _projectId,
    uint256 _number,
    uint256 _weight,
    uint256 _basedOn,
    uint256 _start
  ) private returns (uint256 fundingCycleId) {
    // weight in bytes 0-79 bytes.
    uint256 packed = _weight;
    // projectId in bytes 80-135 bytes.
    packed |= _projectId << 80;
    // basedOn in bytes 136-183 bytes.
    packed |= _basedOn << 136;
    // start in bytes 184-231 bytes.
    packed |= _start << 184;
    // number in bytes 232-255 bytes.
    packed |= _number << 232;

    // Construct the ID.
    fundingCycleId = _idFor(_projectId, _number);

    // Set in storage.
    _packedIntrinsicPropertiesOf[fundingCycleId] = packed;
  }

  /**
    @notice 
    Efficiently stores a funding cycles provided configuration properties.

    @param _fundingCycleId The ID of the funding cycle to pack and store.
    @param _configured The timestamp of the configuration.
    @param _ballot The ballot to use for future reconfiguration approvals. 
    @param _duration The duration of the funding cycle.
    @param _currency The currency of the funding cycle.
    @param _fee The fee of the funding cycle.
    @param _discountRate The discount rate of the base funding cycle.
  */
  function _packAndStoreConfigurationPropertiesOf(
    uint256 _fundingCycleId,
    uint256 _configured,
    IJBFundingCycleBallot _ballot,
    uint256 _duration,
    uint256 _currency,
    uint256 _fee,
    uint256 _discountRate
  ) private {
    // ballot in bytes 0-159 bytes.
    uint256 packed = uint160(address(_ballot));
    // configured in bytes 160-207 bytes.
    packed |= _configured << 160;
    // duration in bytes 208-223 bytes.
    packed |= _duration << 208;
    // basedOn in bytes 224-231 bytes.
    packed |= _currency << 224;
    // fee in bytes 232-239 bytes.
    packed |= _fee << 232;
    // discountRate in bytes 240-255 bytes.
    packed |= _discountRate << 240;

    // Set in storage.
    _packedConfigurationPropertiesOf[_fundingCycleId] = packed;
  }

  /**
    @notice 
    The project's stored funding cycle that hasn't yet started, if one exists.

    @dev
    A value of 0 is returned if no funding cycle was found.
    
    @param _projectId The ID of a project to look through for a standby cycle.

    @return fundingCycleId The ID of the standby funding cycle.
  */
  function _standbyOf(uint256 _projectId) private view returns (uint256 fundingCycleId) {
    // Get a reference to the project's latest funding cycle.
    fundingCycleId = latestIdOf[_projectId];

    // If there isn't one, theres also no standby funding cycle.
    if (fundingCycleId == 0) return 0;

    // Get the necessary properties for the latest funding cycle.
    JBFundingCycle memory _fundingCycle = _getStructFor(fundingCycleId);

    // There is no upcoming funding cycle if the latest funding cycle has already started.
    if (block.timestamp >= _fundingCycle.start) return 0;
  }

  /**
    @notice 
    The project's stored funding cycle that has started and hasn't yet expired.
    
    @dev
    A value of 0 is returned if no funding cycle was found.

    @param _projectId The ID of the project to look through.

    @return fundingCycleId The ID of the active funding cycle.
  */
  function _eligibleOf(uint256 _projectId) private view returns (uint256 fundingCycleId) {
    // Get a reference to the project's latest funding cycle.
    fundingCycleId = latestIdOf[_projectId];

    // If there isn't one, theres also no eligible funding cycle.
    if (fundingCycleId == 0) return 0;

    // Get the necessary properties for the latest funding cycle.
    JBFundingCycle memory _fundingCycle = _getStructFor(fundingCycleId);

    // If the latest is expired, return an empty funding cycle.
    // A duration of 0 can not be expired.
    if (
      _fundingCycle.duration > 0 &&
      block.timestamp >= _fundingCycle.start + (_fundingCycle.duration * _SECONDS_IN_DAY)
    ) return 0;

    // The base cant be expired.
    JBFundingCycle memory _baseFundingCycle = _getStructFor(_fundingCycle.basedOn);

    // If the current time is past the end of the base, return 0.
    // A duration of 0 is always eligible.
    if (
      _baseFundingCycle.duration > 0 &&
      block.timestamp >= _baseFundingCycle.start + (_baseFundingCycle.duration * _SECONDS_IN_DAY)
    ) return 0;

    // Return the funding cycle immediately before the latest.
    fundingCycleId = _fundingCycle.basedOn;
  }

  /** 
    @notice 
    A view of the funding cycle that would be created based on the provided one if the project doesn't make a reconfiguration.

    @dev
    Returns an empty funding cycle if there can't be a mock funding cycle based on the provided one.

    @param _baseFundingCycle The funding cycle that the resulting funding cycle should follow.
    @param _allowMidCycle A flag indicating if the mocked funding cycle is allowed to already be mid cycle.

    @return A mock of what the next funding cycle will be.
  */
  function _mockFundingCycleBasedOn(JBFundingCycle memory _baseFundingCycle, bool _allowMidCycle)
    private
    view
    returns (JBFundingCycle memory)
  {
    // Can't mock a non recurring funding cycle.
    if (_baseFundingCycle.discountRate == 10001) return _getStructFor(0);

    // The distance of the current time to the start of the next possible funding cycle.
    // If the returned mock cycle must not yet have started, the start time of the mock must be in the future so no need to adjust backwards.
    // If the base funding cycle doesn't have a duration, no adjustment is necessary because the next cycle can start immediately.
    uint256 _timeFromImmediateStartMultiple = !_allowMidCycle || _baseFundingCycle.duration == 0
      ? 0
      : _baseFundingCycle.duration * _SECONDS_IN_DAY;

    // Derive what the start time should be.
    uint256 _start = _deriveStartFrom(
      _baseFundingCycle,
      block.timestamp - _timeFromImmediateStartMultiple
    );

    // Derive what the number should be.
    uint256 _number = _deriveNumberFrom(_baseFundingCycle, _start);

    return
      JBFundingCycle(
        _idFor(_baseFundingCycle.projectId, _number),
        _baseFundingCycle.projectId,
        _number,
        _baseFundingCycle.id,
        _baseFundingCycle.configured,
        _deriveWeightFrom(_baseFundingCycle, _start),
        _baseFundingCycle.ballot,
        _start,
        _baseFundingCycle.duration,
        _baseFundingCycle.target,
        _baseFundingCycle.currency,
        _baseFundingCycle.fee,
        _baseFundingCycle.discountRate,
        0,
        _baseFundingCycle.metadata
      );
  }

  /**
    @notice 
    Unpack a funding cycle's packed stored values into an easy-to-work-with funding cycle struct.

    @param _id The funding cycle ID to get the full struct for.

    @return fundingCycle The funding cycle struct.
  */
  function _getStructFor(uint256 _id) private view returns (JBFundingCycle memory fundingCycle) {
    // Return an empty funding cycle if the ID specified is 0.
    if (_id == 0) return fundingCycle;

    fundingCycle.id = _id;

    uint256 _packedIntrinsicProperties = _packedIntrinsicPropertiesOf[_id];

    fundingCycle.weight = uint256(uint80(_packedIntrinsicProperties));
    fundingCycle.projectId = uint256(uint56(_packedIntrinsicProperties >> 80));
    fundingCycle.basedOn = uint256(uint48(_packedIntrinsicProperties >> 136));
    fundingCycle.start = uint256(uint48(_packedIntrinsicProperties >> 184));
    fundingCycle.number = uint256(uint24(_packedIntrinsicProperties >> 232));

    uint256 _packedConfigurationProperties = _packedConfigurationPropertiesOf[_id];

    fundingCycle.ballot = IJBFundingCycleBallot(address(uint160(_packedConfigurationProperties)));
    fundingCycle.configured = uint256(uint48(_packedConfigurationProperties >> 160));
    fundingCycle.duration = uint256(uint16(_packedConfigurationProperties >> 208));
    fundingCycle.currency = uint256(uint8(_packedConfigurationProperties >> 224));
    fundingCycle.fee = uint256(uint8(_packedConfigurationProperties >> 232));
    fundingCycle.discountRate = uint256(uint16(_packedConfigurationProperties >> 240));

    fundingCycle.target = _targetOf[_id];
    fundingCycle.tapped = _tappedAmountOf[_id];
    fundingCycle.metadata = _metadataOf[_id];
  }

  /** 
    @notice 
    The date that is the nearest multiple of the specified funding cycle's duration from its end.

    @param _baseFundingCycle The funding cycle to make the calculation for.
    @param _mustStartOnOrAfter A date that the derived start must be on or come after.

    @return start The next start time.
  */
  function _deriveStartFrom(JBFundingCycle memory _baseFundingCycle, uint256 _mustStartOnOrAfter)
    private
    pure
    returns (uint256 start)
  {
    // A subsequent cycle to one with a duration of 0 should start as soon as possible.
    if (_baseFundingCycle.duration == 0) return _mustStartOnOrAfter;

    // Save a reference to the cycle's duration measured in seconds.
    uint256 _cycleDurationInSeconds = _baseFundingCycle.duration * _SECONDS_IN_DAY;

    // The time when the funding cycle immediately after the specified funding cycle starts.
    uint256 _nextImmediateStart = _baseFundingCycle.start + _cycleDurationInSeconds;

    // If the next immediate start is now or in the future, return it.
    if (_nextImmediateStart >= _mustStartOnOrAfter) return _nextImmediateStart;

    // The amount of seconds since the `_mustStartOnOrAfter` time that results in a start time that might satisfy the specified constraints.
    uint256 _timeFromImmediateStartMultiple = (_mustStartOnOrAfter - _nextImmediateStart) %
      _cycleDurationInSeconds;

    // A reference to the first possible start timestamp.
    start = _mustStartOnOrAfter - _timeFromImmediateStartMultiple;

    // Add increments of duration as necessary to satisfy the threshold.
    while (_mustStartOnOrAfter > start) start = start + _cycleDurationInSeconds;
  }

  /** 
    @notice 
    The accumulated weight change since the specified funding cycle.

    @param _baseFundingCycle The funding cycle to make the calculation with.
    @param _start The start time to derive a weight for.

    @return weight The next weight.
  */
  function _deriveWeightFrom(JBFundingCycle memory _baseFundingCycle, uint256 _start)
    private
    pure
    returns (uint256 weight)
  {
    // A subsequent cycle to one with a duration of 0 should have the next possible weight.
    if (_baseFundingCycle.duration == 0)
      return
        PRBMath.mulDiv(_baseFundingCycle.weight, 10000 - _baseFundingCycle.discountRate, 10000);

    // The weight should be based off the base funding cycle's weight.
    weight = _baseFundingCycle.weight;

    // If the discount is 0, the weight doesn't change.
    if (_baseFundingCycle.discountRate == 0) return weight;

    // The difference between the start of the base funding cycle and the proposed start.
    uint256 _startDistance = _start - _baseFundingCycle.start;

    // Apply the base funding cycle's discount rate for each cycle that has passed.
    uint256 _discountMultiple = _startDistance / (_baseFundingCycle.duration * _SECONDS_IN_DAY);

    for (uint256 i = 0; i < _discountMultiple; i++)
      // The number of times to apply the discount rate.
      // Base the new weight on the specified funding cycle's weight.
      weight = PRBMath.mulDiv(weight, 10000 - _baseFundingCycle.discountRate, 10000);
  }

  /** 
    @notice 
    The number of the next funding cycle given the specified funding cycle.

    @param _baseFundingCycle The funding cycle to make the calculation with.
    @param _start The start time to derive a number for.

    @return The next number.
  */
  function _deriveNumberFrom(JBFundingCycle memory _baseFundingCycle, uint256 _start)
    private
    pure
    returns (uint256)
  {
    // A subsequent cycle to one with a duration of 0 should be the next number.
    if (_baseFundingCycle.duration == 0) return _baseFundingCycle.number + 1;

    // The difference between the start of the base funding cycle and the proposed start.
    uint256 _startDistance = _start - _baseFundingCycle.start;

    // Find the number of base cycles that fit in the start distance.
    return
      _baseFundingCycle.number + (_startDistance / (_baseFundingCycle.duration * _SECONDS_IN_DAY));
  }

  /** 
    @notice 
    Checks to see if the funding cycle of the provided ID is approved according to the correct ballot.

    @param _fundingCycleId The ID of the funding cycle to get an approval flag for.

    @return The approval flag.
  */
  function _isIdApproved(uint256 _fundingCycleId) private view returns (bool) {
    JBFundingCycle memory _fundingCycle = _getStructFor(_fundingCycleId);
    return _isApproved(_fundingCycle);
  }

  /** 
    @notice 
    Checks to see if the provided funding cycle is approved according to the correct ballot.

    @param _fundingCycle The ID of the funding cycle to get an approval flag for.

    @return The approval flag.
  */
  function _isApproved(JBFundingCycle memory _fundingCycle) private view returns (bool) {
    return
      _ballotStateOf(_fundingCycle.id, _fundingCycle.configured, _fundingCycle.basedOn) ==
      JBBallotState.Approved;
  }

  /**
    @notice 
    A funding cycle configuration's current status.

    @param _id The ID of the funding cycle configuration to check the status of.
    @param _configuration This differentiates reconfigurations onto the same upcoming funding cycle, which all would have the same ID but different configuration times.
    @param _ballotFundingCycleId The ID of the funding cycle which is configured with the ballot that should be used.

    @return The funding cycle's configuration status.
  */
  function _ballotStateOf(
    uint256 _id,
    uint256 _configuration,
    uint256 _ballotFundingCycleId
  ) private view returns (JBBallotState) {
    // If there is no ballot funding cycle, implicitly approve.
    if (_ballotFundingCycleId == 0) return JBBallotState.Approved;

    // Get the ballot funding cycle.
    JBFundingCycle memory _ballotFundingCycle = _getStructFor(_ballotFundingCycleId);

    // If the configuration is the same as the ballot's funding cycle,
    // the ballot isn't applicable. Auto approve since the ballot funding cycle is approved.
    if (_ballotFundingCycle.configured >= _configuration) return JBBallotState.Approved;

    // If there is no ballot, the ID is auto approved.
    // Otherwise, return the ballot's state.
    return
      _ballotFundingCycle.ballot == IJBFundingCycleBallot(address(0))
        ? JBBallotState.Approved
        : _ballotFundingCycle.ballot.state(_id, _configuration);
  }

  /** 
    @notice
    The time after the ballot of the provided funding cycle has expired.

    @dev
    If the ballot ends in the past, the current block timestamp will be returned.

    @param _fundingCycle The ID funding cycle to make the caluclation from.
    @param _from The time from which the ballot duration should be calculated.

    @return The time when the ballot has officially ended.
  */
  function _getLatestTimeAfterBallotOf(JBFundingCycle memory _fundingCycle, uint256 _from)
    private
    view
    returns (uint256)
  {
    // If the provided funding cycle has no ballot, return the current timestamp.
    if (_fundingCycle.ballot == IJBFundingCycleBallot(address(0))) return block.timestamp;

    // Get a reference to the time the ballot ends.
    uint256 _ballotExpiration = _from + _fundingCycle.ballot.duration();

    // If the ballot ends in past, return the current timestamp. Otherwise return the ballot's expiration.
    return block.timestamp > _ballotExpiration ? block.timestamp : _ballotExpiration;
  }

  /** 
    @notice 
    Constructs a unique ID from a project ID and a number.

    @param _projectId The ID of the project to use in the ID.
    @param _number The number to use in the ID

    @return The ID that is unique to the provided inputs.
  */
  function _idFor(uint256 _projectId, uint256 _number) private pure returns (uint256) {
    return uint256(uint56(_projectId) | uint24(_number));
  }
}
