// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/utils/Context.sol';

import '../interfaces/IJBDirectory.sol';
import '../libraries/JBTokens.sol';

/**
  @title PaymentSplitter

  @dev based on OpenZeppelin finance/PaymentSplitter.sol v4.7.0
 */
contract MixedPaymentSplitter is Context {
  event PayeeAdded(address account, uint256 shares);
  event ProjectAdded(uint256 project, uint256 shares);
  event PaymentReleased(address account, uint256 amount);
  event PaymentReleased(uint256 projectId, uint256 amount);
  event ERC20PaymentReleased(IERC20 indexed token, address account, uint256 amount);
  event ERC20PaymentReleased(IERC20 indexed token, uint256 projectId, uint256 amount);
  event PaymentReceived(address from, uint256 amount);

  error INVALID_LENGTH();
  error INVALID_DIRECTORY();
  error MISSING_PROJECT_TERMINAL();
  error INVALID_PROJECT();
  error PAYMENT_FAILURE();

  uint256 private totalShares;
  uint256 private totalReleased;

  /**
    @dev share mapping, expressed in bps
   */
  mapping(uint256 => uint256) private shares;

  mapping(uint256 => uint256) private released;

  uint256[] private keys;

  mapping(IERC20 => uint256) private _erc20TotalReleased;
  mapping(IERC20 => mapping(uint256 => uint256)) private _erc20Released;

  IJBDirectory jbxDirectory;

  constructor(
    address[] memory _payees,
    uint256[] memory _projects,
    uint256[] memory _shares,
    IJBDirectory _jbxDirectory
  ) {
    if (_payees.length == 0 && _projects.length == 0) {
      revert INVALID_LENGTH();
    }

    if (_shares.length == 0) {
      revert INVALID_LENGTH();
    }

    if (_payees.length + _projects.length != _shares.length) {
      revert INVALID_LENGTH();
    }

    if (_projects.length != 0 && address(_jbxDirectory) == address(0)) {
      revert INVALID_DIRECTORY();
    }

    for (uint256 i; i != _payees.length; ) {
      _addPayee(_payees[i], _shares[i]);
      ++i;
    }

    for (uint256 i; i != _projects.length; ) {
      _addProject(_projects[i], _shares[_payees.length + i]);
      ++i;
    }
  }

  /**
   * @dev The Ether received will be logged with {PaymentReceived} events. Note that these events are not fully
   * reliable: it's possible for a contract to receive Ether without triggering this function. This only affects the
   * reliability of the events, and not the actual splitting of Ether.
   *
   * To learn more about this see the Solidity documentation for
   * https://solidity.readthedocs.io/en/latest/contracts.html#fallback-function[fallback
   * functions].
   */
  receive() external payable virtual {
    emit PaymentReceived(_msgSender(), msg.value);
  }

  /**
   * @dev Getter for the amount of payee's releasable Ether.
   */
  function releasable(address _account) public view returns (uint256) {
    uint256 totalReceived = address(this).balance + totalReleased;
    return
      _pendingPayment(
        uint256(uint160(_account)),
        totalReceived,
        released[uint256(uint160(_account))]
      );
  }

  function releasable(uint256 _projectId) public view returns (uint256) {
    uint256 totalReceived = address(this).balance + totalReleased;
    return _pendingPayment(_projectId << 160, totalReceived, released[_projectId << 160]);
  }

  function releasable(IERC20 _token, address _account) public view returns (uint256) {
    uint256 totalReceived = _token.balanceOf(address(this)) + _erc20TotalReleased[_token];
    return
      _pendingPayment(
        uint256(uint160(_account)),
        totalReceived,
        _erc20Released[_token][uint256(uint160(_account))]
      );
  }

  function releasable(IERC20 _token, uint256 _projectId) public view returns (uint256) {
    uint256 totalReceived = _token.balanceOf(address(this)) + _erc20TotalReleased[_token];
    return
      _pendingPayment(_projectId << 160, totalReceived, _erc20Released[_token][_projectId << 160]);
  }

  function release(address payable _account) public virtual {
    require(
      shares[uint256(uint160(address(_account)))] > 0,
      'PaymentSplitter: account has no shares'
    );

    uint256 payment = releasable(_account);

    require(payment != 0, 'PaymentSplitter: account is not due payment');

    // _totalReleased is the sum of all values in _released.
    // If "_totalReleased += payment" does not overflow, then "_released[account] += payment" cannot overflow.
    totalReleased += payment;
    unchecked {
      released[uint256(uint160(address(_account)))] += payment;
    }

    Address.sendValue(_account, payment);
    emit PaymentReleased(_account, payment);
  }

  function release(uint256 _projectId) public virtual {
    require(shares[_projectId << 160] > 0, 'PaymentSplitter: account has no shares');

    uint256 payment = releasable(_projectId << 160);

    require(payment != 0, 'PaymentSplitter: account is not due payment');

    // _totalReleased is the sum of all values in _released.
    // If "_totalReleased += payment" does not overflow, then "_released[account] += payment" cannot overflow.
    totalReleased += payment;
    unchecked {
      released[_projectId << 160] += payment;
    }

    IJBPaymentTerminal terminal = jbxDirectory.primaryTerminalOf(_projectId, JBTokens.ETH);
    if (address(terminal) == address(0)) {
      revert PAYMENT_FAILURE();
    }

    terminal.addToBalanceOf(_projectId, payment, JBTokens.ETH, '', '');
    emit PaymentReleased(_projectId, payment);
  }

  function release(IERC20 _token, address _account) public virtual {
    require(shares[uint256(uint160(_account))] > 0, 'PaymentSplitter: account has no shares');

    uint256 payment = releasable(_token, _account);

    require(payment != 0, 'PaymentSplitter: account is not due payment');

    // _erc20TotalReleased[token] is the sum of all values in _erc20Released[token].
    // If "_erc20TotalReleased[token] += payment" does not overflow, then "_erc20Released[token][account] += payment"
    // cannot overflow.
    _erc20TotalReleased[_token] += payment;
    unchecked {
      _erc20Released[_token][uint256(uint160(_account))] += payment;
    }

    IERC20(_token).transfer(_account, payment);
    emit ERC20PaymentReleased(_token, _account, payment);
  }

  function release(IERC20 _token, uint256 _projectId) public virtual {
    uint256 key = _projectId << 160;
    require(shares[key] > 0, 'PaymentSplitter: account has no shares');

    uint256 payment = releasable(_token, key);

    require(payment != 0, 'PaymentSplitter: account is not due payment');

    // _erc20TotalReleased[token] is the sum of all values in _erc20Released[token].
    // If "_erc20TotalReleased[token] += payment" does not overflow, then "_erc20Released[token][account] += payment"
    // cannot overflow.
    _erc20TotalReleased[_token] += payment;
    unchecked {
      _erc20Released[_token][key] += payment;
    }

    IJBPaymentTerminal terminal = jbxDirectory.primaryTerminalOf(_projectId, address(_token));
    if (address(terminal) == address(0)) {
      revert PAYMENT_FAILURE();
    }

    _token.approve(address(terminal), payment);
    terminal.addToBalanceOf(_projectId, payment, JBTokens.ETH, '', '');
    emit ERC20PaymentReleased(_token, _projectId, payment);
  }

  function _pendingPayment(
    uint256 _key,
    uint256 _totalReceived,
    uint256 _alreadyReleased
  ) private view returns (uint256) {
    return (_totalReceived * shares[_key]) / totalShares - _alreadyReleased;
  }

  function _addPayee(address _account, uint256 _shares) private {
    require(_account != address(0), 'PaymentSplitter: account is the zero address');
    require(_shares > 0, 'PaymentSplitter: shares are 0');

    uint256 k = uint256(uint160(_account));
    require(shares[k] == 0, 'PaymentSplitter: account already has shares');

    keys.push(k);

    shares[k] = _shares;
    totalShares += _shares;
    emit PayeeAdded(_account, _shares);
  }

  function _addProject(uint256 _projectId, uint256 _shares) private {
    if (_projectId > type(uint96).max) {
      revert INVALID_PROJECT();
    }

    if (address(jbxDirectory.primaryTerminalOf(_projectId, JBTokens.ETH)) == address(0)) {
      revert MISSING_PROJECT_TERMINAL();
    }

    require(_projectId != 0, 'PaymentSplitter: account is the zero address');
    require(_shares > 0, 'PaymentSplitter: shares are 0');

    uint256 k = _projectId << 160;
    require(shares[k] == 0, 'PaymentSplitter: account already has shares');

    keys.push(k);

    shares[k] = _shares;
    totalShares += _shares;
    emit ProjectAdded(_projectId, _shares);
  }
}
