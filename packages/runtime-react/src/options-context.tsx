import React from 'react'

interface OptionsContextValue {
    optionsMap: Map<string, any[]>
}

export const OptionsContext = React.createContext<OptionsContextValue>({
    optionsMap: new Map(),
})

export const useOptions = () => React.useContext(OptionsContext)
