// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

interface ILogPublisher {
  event Data(bytes data);
  event AddressedData(address indexed account, bytes data);
  event DescribedData(bytes description, bytes data);
  event AddressedDescribedData(address indexed account, bytes description, bytes data);

  function publishData(bytes calldata data) external;

  function publishAddressedData(address account, bytes calldata data) external;

  function publishDescribedData(bytes calldata description, bytes calldata data) external;

  function publishAddressedDescribedData(
    address account,
    bytes calldata description,
    bytes calldata data
  ) external;
}

/**
  @title Ethereum Log publisher

  @notice Publishes events with several payload types to the Ethereum log.
 */
contract LogPublisher is ILogPublisher {
  /**
    @notice Publishes an event with a generic bytes payload. The consumer is expected to know how to parse the binary data.

    @param data Bytes to publish.
   */
  function publishData(bytes calldata data) public override {
    emit Data(data);
  }

  /**
    @notice Publishes an event with a generic bytes payload along with an impacted account. The consumer is expected to know how to parse the binary data.

    @dev The account param is indexed.

    @param account Account associated with the binary data.
    @param data Bytes to publish.
   */
  function publishAddressedData(address account, bytes calldata data) public override {
    emit AddressedData(account, data);
  }

  /**
    @notice Publishes an event with a generic bytes payload along with metadata.

    @dev Associated metadata should be in ERC712 format, but it is not enforced.

    @param description Metadata in json format encoded as bytes.
    @param data Bytes to publish.
   */
  function publishDescribedData(bytes calldata description, bytes calldata data) public override {
    emit DescribedData(description, data);
  }

  /**
    @notice Publishes an event with a generic bytes payload along with metadata for an impacted account.

    @dev Associated metadata should be in ERC712 format, but it is not enforced.
    @dev The account param is indexed.

    @param account Account associated with the binary data.
    @param description Metadata in json format encoded as bytes.
    @param data Bytes to publish.
   */
  function publishAddressedDescribedData(
    address account,
    bytes calldata description,
    bytes calldata data
  ) public override {
    emit AddressedDescribedData(account, description, data);
  }
}
