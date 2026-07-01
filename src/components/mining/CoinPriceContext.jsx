// CoinPriceContext.jsx
import { createContext, useContext, useState } from "react";
import CoinPriceModal from "./CoinPriceModal"; // adjust path if needed

const CoinPriceContext = createContext();

export function CoinPriceProvider({ children, onCall }) {
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  const openCoinModal = (coinSymbol) => {
    setSelectedCoin({
      symbol: coinSymbol,
      name: coinSymbol,
      coinId: coinSymbol.toLowerCase(),
    });
    setIsOpen(true);
  };

  const closeCoinModal = () => setIsOpen(false);

  return (
    <CoinPriceContext.Provider value={{ openCoinModal }}>
      {children}
      <CoinPriceModal
        isOpen={isOpen}
        onClose={closeCoinModal}
        coin={selectedCoin}
        onCall={onCall}
      />
    </CoinPriceContext.Provider>
  );
}

export function useCoinPrice() {
  const context = useContext(CoinPriceContext);
  if (!context) {
    throw new Error("useCoinPrice must be used within a CoinPriceProvider");
  }
  return context;
}