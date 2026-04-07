/**
 * Sync domain — POS transactions, products, customers, inventory integrity.
 */
module.exports = {
  transactionService: require("../../services/transactionService"),
  productService: require("../../services/productService"),
  customerService: require("../../services/customerService"),
  inventoryIntegrityService: require("../../services/inventoryIntegrityService"),
};
