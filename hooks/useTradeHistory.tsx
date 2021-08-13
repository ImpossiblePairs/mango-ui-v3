import {
  getMarketByPublicKey,
  MangoGroup,
} from '@blockworks-foundation/mango-client'
import { PublicKey } from '@solana/web3.js'
import useMangoStore from '../stores/useMangoStore'

const byTimestamp = (a, b) => {
  return (
    new Date(b.loadTimestamp || b.timestamp * 1000).getTime() -
    new Date(a.loadTimestamp || a.timestamp * 1000).getTime()
  )
}

const reverseSide = (side) => (side === 'buy' ? 'sell' : 'buy')

function getPerpMarketName(event) {
  const mangoGroupConfig = useMangoStore.getState().selectedMangoGroup.config

  let marketName
  if (!event.marketName) {
    const marketInfo = getMarketByPublicKey(mangoGroupConfig, event.address)
    marketName = marketInfo.name
  }
  return event.marketName || marketName
}

const parsedPerpEvent = (
  mangoGroup: MangoGroup,
  mangoAccountPk: PublicKey,
  event
) => {
  const maker = event.maker.toString() === mangoAccountPk.toString()
  const orderId = maker ? event.makerOrderId : event.takerOrderId
  const value = event.quantity * event.price
  const feeRate = maker ? event.makerFee : event.takerFee
  const side = maker ? reverseSide(event.takerSide) : event.takerSide

  return {
    ...event,
    key: orderId.toString(),
    liquidity: maker ? 'Maker' : 'Taker',
    size: event.quantity,
    price: event.price,
    value,
    feeCost: (feeRate * value).toFixed(4),
    side,
    marketName: getPerpMarketName(event),
  }
}

const parsedSerumEvent = (event) => {
  return {
    ...event,
    key: `${event.maker}-${event.price}`,
    liquidity: event?.eventFlags?.maker ? 'Maker' : 'Taker',
    value: event.price * event.size,
    side: event.side,
  }
}

const formatTradeHistory = (
  selectedMangoGroup,
  mangoAccountPk: PublicKey,
  newTradeHistory
) => {
  return newTradeHistory
    .flat()
    .map((trade) => {
      if (trade.eventFlags) {
        return parsedSerumEvent(trade)
      } else {
        return parsedPerpEvent(selectedMangoGroup, mangoAccountPk, trade)
      }
    })
    .sort(byTimestamp)
}

export const useTradeHistory = () => {
  const marketConfig = useMangoStore((s) => s.selectedMarket.config)
  const fills = useMangoStore((s) => s.selectedMarket.fills)
  const mangoAccount = useMangoStore((s) => s.selectedMangoAccount.current)
  const selectedMangoGroup = useMangoStore((s) => s.selectedMangoGroup.current)
  const tradeHistory = useMangoStore((s) => s.tradeHistory)

  if (!mangoAccount || !selectedMangoGroup) return null
  const openOrdersAccount =
    mangoAccount.spotOpenOrdersAccounts[marketConfig.marketIndex]

  const mangoAccountFills = fills
    .filter((fill) => {
      if (fill.openOrders) {
        return openOrdersAccount?.publicKey
          ? fill.openOrders.equals(openOrdersAccount?.publicKey)
          : false
      } else {
        return (
          fill.taker.equals(mangoAccount.publicKey) ||
          fill.maker.equals(mangoAccount.publicKey)
        )
      }
    })
    .map((fill) => ({ ...fill, marketName: marketConfig.name }))

  const allTrades = []
  if (mangoAccountFills && mangoAccountFills.length > 0) {
    const newFills = mangoAccountFills.filter(
      (fill) =>
        !tradeHistory.flat().find((t) => {
          if (t.orderId) {
            return t.orderId === fill.orderId?.toString()
          } else {
            return t.seqNum === fill.seqNum?.toString()
          }
        })
    )
    const newTradeHistory = [...newFills, ...tradeHistory]
    if (newFills.length > 0 && newTradeHistory.length !== allTrades.length) {
      return formatTradeHistory(
        selectedMangoGroup,
        mangoAccount.publicKey,
        newTradeHistory
      )
    }
  }

  return formatTradeHistory(
    selectedMangoGroup,
    mangoAccount.publicKey,
    tradeHistory
  )
}

export default useTradeHistory
