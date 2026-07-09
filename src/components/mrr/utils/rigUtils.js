import { getRawHashrateValue } from './hashrateUtils.js';

export const getRigStatus = (rig) => {
  const statusStr = String(
    typeof rig.status === "object" ? rig.status.status : rig.status || ""
  ).toLowerCase();
  const rentalId = rig.rentalid || rig.current_rental_id || rig.rental_id;
  const isRented = statusStr.includes("rented") || 
    statusStr.includes("active") || 
    Boolean(rentalId);
  const displayId = isRented && rentalId ? rentalId : rig.id;
  
  return {
    statusStr,
    isRented,
    rentalId,
    displayId,
    idLabel: isRented && rentalId ? "Rental" : "Rig"
  };
};

export const getRentalTimes = (info, rig) => {
  const startTime = info?.startTime || rig.start;
  const endTime = info?.endTime || 
    rig.end || 
    (typeof rig.status === "object" ? rig.status.end : null);
  
  return { startTime, endTime };
};

export const getHashrateInfo = (info, rig) => {
  const current = info?.rawCur || rig.hashrate?.current || 0;
  const advertised = info?.rawAds || 
    getRawHashrateValue(rig.hashrate?.advertised || rig.advertised) || 0;
  const average = info?.rawAvg || 
    getRawHashrateValue(rig.hashrate?.average || rig.average || rig.hash) || 0;
  const suffix = info?.hashrate?.suffix || 
    rig.hashrate?.advertised?.type || 
    info?.hashrate_unit || 
    info?.unit || 
    "H";
  
  return { 
    current: typeof current === 'number' ? current : parseFloat(current) || 0,
    advertised: typeof advertised === 'number' ? advertised : parseFloat(advertised) || 0,
    average: typeof average === 'number' ? average : parseFloat(average) || 0,
    suffix: String(suffix || "H")
  };
};

export const getRigDuration = (info, rig) => {
  return parseFloat(
    info?.duration ?? 
    info?.hours ?? 
    rig.duration ?? 
    rig.hours ?? 
    rig.length ?? 
    0
  );
};

export const getRigEfficiency = (info, rig, avgVal, adsVal) => {
  const effValue = info?.percent ?? 
    rig.hashrate?.average?.percent ?? 
    rig.percent ?? 
    (adsVal > 0 ? (avgVal / adsVal) * 100 : 0);
  
  return Number.isFinite(Number(effValue)) ? Number(effValue) : 0;
};