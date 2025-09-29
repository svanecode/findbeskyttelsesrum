'use client'

import { createPathComponent } from '@react-leaflet/core'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

interface MarkerClusterGroupProps extends L.MarkerClusterGroupOptions {
  children: React.ReactNode
}

const MarkerClusterGroup = createPathComponent<L.MarkerClusterGroup, MarkerClusterGroupProps>(
  (props, context) => {
    const clusterProps: L.MarkerClusterGroupOptions = {}
    const clusterEvents: L.LeafletEventHandlerFnMap = {}

    // Extract Leaflet MarkerCluster options from props
    Object.entries(props).forEach(([propName, prop]) => {
      if (propName.startsWith('on') && typeof prop === 'function') {
        clusterEvents[propName.substring(2).toLowerCase() as keyof L.LeafletEventHandlerFnMap] = prop
      } else if (propName !== 'children') {
        ;(clusterProps as any)[propName] = prop
      }
    })

    const clusterGroup = new (L as any).MarkerClusterGroup(clusterProps)

    return {
      instance: clusterGroup,
      context: { ...context, layerContainer: clusterGroup },
    }
  }
)

export default MarkerClusterGroup