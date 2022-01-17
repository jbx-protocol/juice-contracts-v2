// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import '@paulrberg/contracts/math/PRBMath.sol';

import './abstract/JBControllerUtility.sol';
import './interfaces/IJBFundingCycleStore.sol';
import './libraries/JBConstants.sol';

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error FUNDING_CYCLE_CONFIGURATION_NOT_FOUND();
error INVALID_DISCOUNT_RATE();
error INVALID_DURATION();
error INVALID_WEIGHT();
error NON_RECURRING_FUNDING_CYCLE();

/** 
  @notice 
  Manages funding cycle scheduling.
*/
contract JBFundingCycleStore is JBControllerUtility, IJBFundingCycleStore {
  //*********************************************************************//
  // --------------------- private stored properties ------------------- //
  //*********************************************************************//

  /** 
    @notice
    Stores the user defined properties of each funding cycle, packed into one storage slot.

    _projectId The ID of the project to get properties of.
    _configuration The funding cycle configuration to get properties of.
  */
  mapping(uint256 => mapping(uint256 => uint256)) private _packedUserPropertiesOf;

  /** 
    @notice
    Stores the properties added by the mechanism to manage and schedule each funding cycle, packed into one storage slot.
    
    _projectId The ID of the project to get instrinsic properties of.
    _configuration The funding cycle configuration to get properties of.
  */
  mapping(uint256 => mapping(uint256 => uint256)) private _packedIntrinsicPropertiesOf;

  /** 
    @notice
    Stores the metadata for each funding cycle configuration, packed into one storage slot.

    _projectId The ID of the project to get metadata of.
    _configuration The funding cycle configuration to get metadata of.
  */
  mapping(uint256 => mapping(uint256 => uint256)) private _metadataOf;

  //*********************************************************************//
  // --------------------- public stored properties -------------------- //
  //*********************************************************************//

  /** 
    @notice 
    The latest funding cycle configuration for each project.

    _projectId The ID of the project to get the latest funding cycle configuration of.
  */
  mapping(uint256 => uint256) public override latestConfigurationOf;

  //*********************************************************************//
  // ------------------------- external views -------------------------- //
  //*********************************************************************//

  /**
    @notice 
    Get the funding cycle with the given configuration for the specified project.

    @param _projectId The ID of the project to which the funding cycle belongs.
    @param _configuration The configuration of the funding cycle to get.

    @return fundingCycle The funding cycle.
  */
  function get(uint256 _projectId, uint256 _configuration)
    external
    view
    override
    returns (JBFundingCycle memory fundingCycle)
  {
    return _getStructFor(_projectId, _configuration);
  }

  /**
    @notice 
    The funding cycle that's next up for the specified project.

    @dev
    Returns an empty funding cycle with all properties set to 0 if a queued funding cycle of the project is not found.

    @param _projectId The ID of the project to get the queued funding cycle of.

    @return _fundingCycle The queued funding cycle.
  */
  function queuedOf(uint256 _projectId) public view override returns (JBFundingCycle memory) {
    // The project must have funding cycles.
    if (latestConfigurationOf[_projectId] == 0) return _getStructFor(0, 0);

    // Get a reference to the configuration of the standby funding cycle.
    uint256 _fundingCycleConfiguration = _standbyOf(_projectId);

    // If it exists, return it's funding cycle.
    if (_fundingCycleConfiguration > 0)
      return _getStructFor(_projectId, _fundingCycleConfiguration);

    // Get a reference to the latest stored funding cycle configuration for the project.
    _fundingCycleConfiguration = latestConfigurationOf[_projectId];

    // Resolve the funding cycle for the for the latest configured funding cycle.
    JBFundingCycle memory _fundingCycle = _getStructFor(_projectId, _fundingCycleConfiguration);

    // There's no queued if the current has a duration of 0.
    if (_fundingCycle.duration == 0) return _getStructFor(0, 0);

    // Check to see if this funding cycle's ballot is approved.
    // If so, return a funding cycle based on it.
    if (_isApproved(_projectId, _fundingCycle))
      return _mockFundingCycleBasedOn(_fundingCycle, false);

    // If it hasn't been approved, set the configuration to be that of its base funding cycle, which carries the last approved configuration.
    _fundingCycleConfiguration = _fundingCycle.basedOn;

    // A funding cycle must exist.
    if (_fundingCycleConfiguration == 0) return _getStructFor(0, 0);

    // Return a mock of the next up funding cycle.
    // Use second next because the next would be a mock of the current funding cycle, not the queued one.
    return _mockFundingCycleBasedOn(_getStructFor(_projectId, _fundingCycleConfiguration), false);
  }

  /**
    @notice 
    The funding cycle that is currently active for the specified project.

    @dev
    Returns an empty funding cycle with all properties set to 0 if a current funding cycle of the project is not found.

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
    if (latestConfigurationOf[_projectId] == 0) return _getStructFor(0, 0);

    // Get a reference to the configuration of the eligible funding cycle.
    uint256 _fundingCycleConfiguration = _eligibleOf(_projectId);

    // Keep a reference to the eligible funding cycle.
    JBFundingCycle memory _fundingCycle;

    // If a standby funding cycle exists...
    if (_fundingCycleConfiguration > 0) {
      // Resolve the funding cycle for the eligible configuration.
      _fundingCycle = _getStructFor(_projectId, _fundingCycleConfiguration);

      // Check to see if this funding cycle's ballot is approved.
      // If so, return it.
      if (_isApproved(_projectId, _fundingCycle)) return _fundingCycle;

      // If it hasn't been approved, set the funding cycle configuration to be the configuration of the funding cycle that it's based on,
      // which carries the last approved configuration.
      _fundingCycleConfiguration = _fundingCycle.basedOn;
    } else {
      // No upcoming funding cycle found that is eligible to become active,
      // so use the last configuration.
      _fundingCycleConfiguration = latestConfigurationOf[_projectId];

      // Get the funding cycle for the latest ID.
      _fundingCycle = _getStructFor(_projectId, _fundingCycleConfiguration);

      // If it's not approved or if it hasn't yet started, get a reference to the funding cycle that the latest is based on, which has the latest approved configuration.
      if (!_isApproved(_projectId, _fundingCycle) || block.timestamp < _fundingCycle.start)
        _fundingCycleConfiguration = _fundingCycle.basedOn;
    }

    // The funding cycle cant be 0.
    if (_fundingCycleConfiguration == 0) return _getStructFor(0, 0);

    // The funding cycle to base a current one on.
    _fundingCycle = _getStructFor(_projectId, _fundingCycleConfiguration);

    // Return a mock of the current funding cycle.
    return _mockFundingCycleBasedOn(_fundingCycle, true);
  }

  /** 
    @notice 
    The current ballot state of the project.

    @param _projectId The ID of the project to check the ballot state of.

    @return The current ballot's state.
  */
  function currentBallotStateOf(uint256 _projectId) external view override returns (JBBallotState) {
    // Get a reference to the latest funding cycle configuration.
    uint256 _fundingCycleConfiguration = latestConfigurationOf[_projectId];

    // The project must have funding cycles.
    if (_fundingCycleConfiguration == 0) {
      revert FUNDING_CYCLE_CONFIGURATION_NOT_FOUND();
    }

    // Resolve the funding cycle for the for the latest configuration.
    JBFundingCycle memory _fundingCycle = _getStructFor(_projectId, _fundingCycleConfiguration);

    // If the latest funding cycle is the first, it must be approved.
    if (_fundingCycle.basedOn == 0) return JBBallotState.Approved;

    return _ballotStateOf(_projectId, _fundingCycle.configuration, _fundingCycle.basedOn);
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
      @dev _data.duration The duration of the funding cycle for which the `_target` amount is needed. Measured in days. 
        Set to 0 for no expiry and to be able to reconfigure anytime.
      @dev _data.discountRate A number from 0-1000000000 indicating how valuable a contribution to this funding cycle is compared to previous funding cycles.
        If it's 0, each funding cycle will have equal weight.
        If the number is 900000000, a contribution to the next funding cycle will only give you 10% of tickets given to a contribution of the same amoutn during the current funding cycle.
      @dev _data.ballot The new ballot that will be used to approve subsequent reconfigurations.
    @param _metadata Data to associate with this funding cycle configuration.

    @return The funding cycle that the configuration will take effect during.
  */
  function configureFor(
    uint256 _projectId,
    JBFundingCycleData calldata _data,
    uint256 _metadata
  ) external override onlyController(_projectId) returns (JBFundingCycle memory) {
    // Duration must fit in a uint64, and must be greater than 1000 seconds to prevent manipulative miner behavior.
    if (_data.duration > type(uint64).max || _data.duration <= 1000) {
      revert INVALID_DURATION();
    }

    // Discount rate token must be less than or equal to 100%. A value of 1000000001 means non-recurring.
    if (_data.discountRate > JBConstants.MAX_DISCOUNT_RATE) {
      revert INVALID_DISCOUNT_RATE();
    }

    // Weight must fit into a uint88.
    if (_data.weight > type(uint88).max) {
      revert INVALID_WEIGHT();
    }

    // The configuration timestamp is now.
    uint256 _configuration = block.timestamp;

    // Set up a reconfiguration by configuring intrinsic properties.
    _configureIntrinsicProperiesFor(_projectId, _configuration, _data.weight);

    // Store the configuration.
    _packAndStoreUserPropertiesOf(
      _configuration,
      _projectId,
      _data.ballot,
      _data.duration,
      _data.discountRate
    );

    // Set the metadata if needed.
    if (_metadata > 0) _metadataOf[_projectId][_configuration] = _metadata;

    emit Configure(_configuration, _projectId, _data, _metadata, msg.sender);

    // Return the funding cycle for the new configuration.
    return _getStructFor(_projectId, _configuration);
  }

  //*********************************************************************//
  // --------------------- private helper functions -------------------- //
  //*********************************************************************//

  /**
    @notice 
    Updates the configurable funding cycle for this project if it exists, otherwise creates one.

    @param _projectId The ID of the project to find a configurable funding cycle for.
    @param _configuration The time at which the configuration is occurring.
    @param _weight The weight to store in the configured funding cycle.
  */
  function _configureIntrinsicProperiesFor(
    uint256 _projectId,
    uint256 _configuration,
    uint256 _weight
  ) private {
    // If there's not yet a funding cycle for the project, initialize one.
    if (latestConfigurationOf[_projectId] == 0) {
      _initFor(_projectId, _getStructFor(0, 0), _configuration, block.timestamp, _weight);
      return;
    }

    // Get the standby funding cycle's configuration.
    uint256 _currentConfiguration = _standbyOf(_projectId);

    // If it exists, make sure its updated, then return it.
    if (_currentConfiguration > 0) {
      // Get the funding cycle that the specified one is based on.
      JBFundingCycle memory _baseFundingCycle = _getStructFor(
        _projectId,
        _getStructFor(_projectId, _currentConfiguration).basedOn
      );

      // Update the funding cycle to make sure the base's ballot has been approved.
      _updateAndStoreIntrinsicPropertiesOf(
        _configuration,
        _projectId,
        _baseFundingCycle,
        _getLatestTimeAfterBallotOf(_baseFundingCycle, _configuration),
        _weight
      );

      return;
    }

    // Get the active funding cycle's configuration.
    _currentConfiguration = _eligibleOf(_projectId);

    // If an eligible funding cycle does not exist, get a reference to the latest funding cycle configuration for the project.
    if (_currentConfiguration == 0)
      // Get the latest funding cycle's configuration.
      _currentConfiguration = latestConfigurationOf[_projectId];

    if (!_isConfigurationApproved(_projectId, _currentConfiguration))
      // If it hasn't been approved, set the ID to be the based funding cycle,
      // which carries the last approved configuration.
      _currentConfiguration = _getStructFor(_projectId, _currentConfiguration).basedOn;

    // Get the funding cycle for the configuration.
    JBFundingCycle memory _currentFundingCycle = _getStructFor(_projectId, _currentConfiguration);

    // Make sure the funding cycle is recurring.
    if (_currentFundingCycle.discountRate >= 1000000001) {
      revert NON_RECURRING_FUNDING_CYCLE();
    }

    // Determine if the configurable funding cycle can only take effect on or after a certain date.
    // The ballot must have ended.
    uint256 _mustStartOnOrAfter = _getLatestTimeAfterBallotOf(_currentFundingCycle, _configuration);

    // Initialize a funding cycle.
    _initFor(_projectId, _currentFundingCycle, _configuration, _mustStartOnOrAfter, _weight);
  }

  /**
    @notice 
    Initializes a funding cycle with the appropriate properties.

    @param _projectId The ID of the project to which the funding cycle being initialized belongs.
    @param _baseFundingCycle The funding cycle to base the initialized one on.
    @param _configuration The configuration of the funding cycle being initialized.
    @param _mustStartOnOrAfter The time before which the initialized funding cycle can't start.
    @param _weight The weight to give the newly initialized funding cycle.
  */
  function _initFor(
    uint256 _projectId,
    JBFundingCycle memory _baseFundingCycle,
    uint256 _configuration,
    uint256 _mustStartOnOrAfter,
    uint256 _weight
  ) private {
    // If there is no base, initialize a first cycle.
    if (_baseFundingCycle.number == 0) {
      // The first number is 1.
      uint256 _number = 1;

      // Set fresh intrinsic properties.
      _packAndStoreIntrinsicPropertiesOf(
        _configuration,
        _projectId,
        _number,
        _weight,
        _baseFundingCycle.configuration,
        block.timestamp
      );
    } else {
      // Update the intrinsic properties of the funding cycle being initialized.
      _updateAndStoreIntrinsicPropertiesOf(
        _configuration,
        _projectId,
        _baseFundingCycle,
        _mustStartOnOrAfter,
        _weight
      );
    }

    // Set the project's latest funding cycle configuration.
    latestConfigurationOf[_projectId] = _configuration;

    emit Init(_configuration, _projectId, _baseFundingCycle.configuration);
  }

  /** 
    @notice
    Updates and stores intrinsic properties for a funding cycle.

    @param _configuration The configuration of the funding cycle being updated.
    @param _projectId The ID of the project whose funding cycle is being updated.
    @param _baseFundingCycle The cycle that the one being updated is based on.
    @param _mustStartOnOrAfter The time before which the new updated funding cycle can't start.
    @param _weight The weight to store along with a newly updated funding cycle.
  */
  function _updateAndStoreIntrinsicPropertiesOf(
    uint256 _configuration,
    uint256 _projectId,
    JBFundingCycle memory _baseFundingCycle,
    uint256 _mustStartOnOrAfter,
    uint256 _weight
  ) private {
    // Derive the correct next start time from the base.
    uint256 _start = _deriveStartFrom(_baseFundingCycle, _mustStartOnOrAfter);

    // A weight of 1 is treated as a weight of 0.
    _weight = _weight > 0
      ? (_weight == 1 ? 0 : _weight)
      : _deriveWeightFrom(_baseFundingCycle, _start);

    // Derive the correct number.
    uint256 _number = _deriveNumberFrom(_baseFundingCycle, _start);

    // Update the intrinsic properties.
    _packAndStoreIntrinsicPropertiesOf(
      _configuration,
      _projectId,
      _number,
      _weight,
      _baseFundingCycle.configuration,
      _start
    );
  }

  /**
    @notice 
    Efficiently stores a funding cycle's provided intrinsic properties.

    @param _configuration The configuration of the funding cycle to pack and store.
    @param _projectId The ID of the project to which the funding cycle belongs.
    @param _number The number of the funding cycle.
    @param _weight The weight of the funding cycle.
    @param _basedOn The configuration of the based funding cycle.
    @param _start The start time of this funding cycle.
  */
  function _packAndStoreIntrinsicPropertiesOf(
    uint256 _configuration,
    uint256 _projectId,
    uint256 _number,
    uint256 _weight,
    uint256 _basedOn,
    uint256 _start
  ) private {
    // weight in bytes 0-87.
    uint256 packed = _weight;
    // basedOn in bytes 88-143.
    packed |= _basedOn << 88;
    // start in bytes 144-199.
    packed |= _start << 144;
    // number in bytes 200-255.
    packed |= _number << 200;

    // Set in storage.
    _packedIntrinsicPropertiesOf[_projectId][_configuration] = packed;
  }

  /**
    @notice 
    Efficiently stores a funding cycles provided user defined properties.

    @param _configuration The configuration of the funding cycle to pack and store.
    @param _projectId The ID of the project to which the funding cycle being packed and stored belongs.
    @param _ballot The ballot to use for future reconfiguration approvals. 
    @param _duration The duration of the funding cycle.
    @param _discountRate The discount rate of the base funding cycle.
  */
  function _packAndStoreUserPropertiesOf(
    uint256 _configuration,
    uint256 _projectId,
    IJBFundingCycleBallot _ballot,
    uint256 _duration,
    uint256 _discountRate
  ) private {
    // If all properties are zero, no need to store anything as the default value will have the same outcome.
    if (_ballot == IJBFundingCycleBallot(address(0)) && _duration == 0 && _discountRate == 0)
      return;

    // ballot in bits 0-159 bytes.
    uint256 packed = uint160(address(_ballot));
    // duration in bits 160-223 bytes.
    packed |= _duration << 160;
    // discountRate in bits 224-255 bytes.
    packed |= _discountRate << 224;

    // Set in storage.
    _packedUserPropertiesOf[_projectId][_configuration] = packed;
  }

  /**
    @notice 
    The project's stored funding cycle that hasn't yet started, if one exists.

    @dev
    A value of 0 is returned if no funding cycle was found.
    
    @param _projectId The ID of a project to look through for a standby cycle.

    @return configuration The configuration of the standby funding cycle.
  */
  function _standbyOf(uint256 _projectId) private view returns (uint256 configuration) {
    // Get a reference to the project's latest funding cycle.
    configuration = latestConfigurationOf[_projectId];

    // If there isn't one, theres also no standby funding cycle.
    if (configuration == 0) return 0;

    // Get the necessary properties for the latest funding cycle.
    JBFundingCycle memory _fundingCycle = _getStructFor(_projectId, configuration);

    // There is no upcoming funding cycle if the latest funding cycle has already started.
    if (block.timestamp >= _fundingCycle.start) return 0;
  }

  /**
    @notice 
    The project's stored funding cycle that has started and hasn't yet expired.
    
    @dev
    A value of 0 is returned if no funding cycle was found.

    @param _projectId The ID of the project to look through.

    @return configuration The configuration of the active funding cycle.
  */
  function _eligibleOf(uint256 _projectId) private view returns (uint256 configuration) {
    // Get a reference to the project's latest funding cycle.
    configuration = latestConfigurationOf[_projectId];

    // If there isn't one, theres also no eligible funding cycle.
    if (configuration == 0) return 0;

    // Get the necessary properties for the latest funding cycle.
    JBFundingCycle memory _fundingCycle = _getStructFor(_projectId, configuration);

    // If the latest is expired, return an empty funding cycle.
    // A duration of 0 can not be expired.
    if (
      _fundingCycle.duration > 0 && block.timestamp >= _fundingCycle.start + _fundingCycle.duration
    ) return 0;

    // The base cant be expired.
    JBFundingCycle memory _baseFundingCycle = _getStructFor(_projectId, _fundingCycle.basedOn);

    // If the current time is past the end of the base, return 0.
    // A duration of 0 is always eligible.
    if (
      _baseFundingCycle.duration > 0 &&
      block.timestamp >= _baseFundingCycle.start + _baseFundingCycle.duration
    ) return 0;

    // Return the funding cycle immediately before the latest.
    configuration = _fundingCycle.basedOn;
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
    // The distance of the current time to the start of the next possible funding cycle.
    // If the returned mock cycle must not yet have started, the start time of the mock must be in the future so no need to adjust backwards.
    // If the base funding cycle doesn't have a duration, no adjustment is necessary because the next cycle can start immediately.
    uint256 _timeFromImmediateStartMultiple = !_allowMidCycle || _baseFundingCycle.duration == 0
      ? 0
      : _baseFundingCycle.duration;

    // Derive what the start time should be.
    uint256 _start = _deriveStartFrom(
      _baseFundingCycle,
      block.timestamp - _timeFromImmediateStartMultiple
    );

    // Derive what the number should be.
    uint256 _number = _deriveNumberFrom(_baseFundingCycle, _start);

    return
      JBFundingCycle(
        _number,
        _baseFundingCycle.configuration,
        _baseFundingCycle.basedOn,
        _start,
        _baseFundingCycle.duration,
        _deriveWeightFrom(_baseFundingCycle, _start),
        _baseFundingCycle.discountRate,
        _baseFundingCycle.ballot,
        _baseFundingCycle.metadata
      );
  }

  /**
    @notice 
    Unpack a funding cycle's packed stored values into an easy-to-work-with funding cycle struct.

    @param _projectId The ID of the project to which the funding cycle belongs.
    @param _configuration The funding cycle configuration to get the full struct for.

    @return fundingCycle The funding cycle struct.
  */
  function _getStructFor(uint256 _projectId, uint256 _configuration)
    private
    view
    returns (JBFundingCycle memory fundingCycle)
  {
    // Return an empty funding cycle if the configuration specified is 0.
    if (_configuration == 0) return fundingCycle;

    fundingCycle.configuration = _configuration;

    uint256 _packedIntrinsicProperties = _packedIntrinsicPropertiesOf[_projectId][_configuration];

    fundingCycle.weight = uint256(uint88(_packedIntrinsicProperties));
    fundingCycle.basedOn = uint256(uint56(_packedIntrinsicProperties >> 136));
    fundingCycle.start = uint256(uint56(_packedIntrinsicProperties >> 128));
    fundingCycle.number = uint256(uint56(_packedIntrinsicProperties >> 176));

    uint256 _packedUserProperties = _packedUserPropertiesOf[_projectId][_configuration];

    fundingCycle.ballot = IJBFundingCycleBallot(address(uint160(_packedUserProperties)));
    fundingCycle.duration = uint256(uint64(_packedUserProperties >> 208));
    fundingCycle.discountRate = uint256(uint32(_packedUserProperties >> 224));

    fundingCycle.metadata = _metadataOf[_projectId][_configuration];
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

    // The time when the funding cycle immediately after the specified funding cycle starts.
    uint256 _nextImmediateStart = _baseFundingCycle.start + _baseFundingCycle.duration;

    // If the next immediate start is now or in the future, return it.
    if (_nextImmediateStart >= _mustStartOnOrAfter) return _nextImmediateStart;

    // The amount of seconds since the `_mustStartOnOrAfter` time that results in a start time that might satisfy the specified constraints.
    uint256 _timeFromImmediateStartMultiple = (_mustStartOnOrAfter - _nextImmediateStart) %
      _baseFundingCycle.duration;

    // A reference to the first possible start timestamp.
    start = _mustStartOnOrAfter - _timeFromImmediateStartMultiple;

    // Add increments of duration as necessary to satisfy the threshold.
    while (_mustStartOnOrAfter > start) start = start + _baseFundingCycle.duration;
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
        PRBMath.mulDiv(
          _baseFundingCycle.weight,
          JBConstants.MAX_DISCOUNT_RATE - _baseFundingCycle.discountRate,
          JBConstants.MAX_DISCOUNT_RATE
        );

    // The weight should be based off the base funding cycle's weight.
    weight = _baseFundingCycle.weight;

    // If the discount is 0, the weight doesn't change.
    if (_baseFundingCycle.discountRate == 0) return weight;

    // The difference between the start of the base funding cycle and the proposed start.
    uint256 _startDistance = _start - _baseFundingCycle.start;

    // Apply the base funding cycle's discount rate for each cycle that has passed.
    uint256 _discountMultiple = _startDistance / _baseFundingCycle.duration;

    for (uint256 i = 0; i < _discountMultiple; i++)
      // The number of times to apply the discount rate.
      // Base the new weight on the specified funding cycle's weight.
      weight = PRBMath.mulDiv(
        weight,
        JBConstants.MAX_DISCOUNT_RATE - _baseFundingCycle.discountRate,
        JBConstants.MAX_DISCOUNT_RATE
      );
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
    return _baseFundingCycle.number + (_startDistance / _baseFundingCycle.duration);
  }

  /** 
    @notice 
    Checks to see if the funding cycle of the provided configuration is approved according to the correct ballot.

    @param _projectId The ID of the project to which the funding cycle belongs.
    @param _configuration The configuration of the funding cycle to get an approval flag for.

    @return The approval flag.
  */
  function _isConfigurationApproved(uint256 _projectId, uint256 _configuration)
    private
    view
    returns (bool)
  {
    JBFundingCycle memory _fundingCycle = _getStructFor(_projectId, _configuration);
    return _isApproved(_projectId, _fundingCycle);
  }

  /** 
    @notice 
    Checks to see if the provided funding cycle is approved according to the correct ballot.

    @param _projectId The ID of the project to which the funding cycle belongs. 
    @param _fundingCycle The funding cycle to get an approval flag for.

    @return The approval flag.
  */
  function _isApproved(uint256 _projectId, JBFundingCycle memory _fundingCycle)
    private
    view
    returns (bool)
  {
    return
      _ballotStateOf(_projectId, _fundingCycle.configuration, _fundingCycle.basedOn) ==
      JBBallotState.Approved;
  }

  /**
    @notice 
    A funding cycle configuration's current status.

    @param _projectId The ID of the project to which the funding cycle belongs.
    @param _configuration This differentiates reconfigurations onto the same upcoming funding cycle, which all would have the same ID but different configuration times.
    @param _ballotFundingCycleId The ID of the funding cycle which is configured with the ballot that should be used.

    @return The funding cycle's configuration status.
  */
  function _ballotStateOf(
    uint256 _projectId,
    uint256 _configuration,
    uint256 _ballotFundingCycleId
  ) private view returns (JBBallotState) {
    // If there is no ballot funding cycle, implicitly approve.
    if (_ballotFundingCycleId == 0) return JBBallotState.Approved;

    // Get the ballot funding cycle.
    JBFundingCycle memory _ballotFundingCycle = _getStructFor(_projectId, _ballotFundingCycleId);

    // If there is no ballot, the ID is auto approved.
    // Otherwise, return the ballot's state.
    return
      _ballotFundingCycle.ballot == IJBFundingCycleBallot(address(0))
        ? JBBallotState.Approved
        : _ballotFundingCycle.ballot.stateOf(_configuration);
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
}
