(ns pumpr.group
  (:require [pumpr.core :as p]
            [pumpr.graph-utils :as pgu]))

(defn group-start [subgraph input-map output-map cell]
  (p/extend-streams
   {:type :group-start
    :subgraph subgraph
    :input-map input-map
    :output-map output-map
    :cell cell}  ;; TODO: consider removing :cell
   (let [parents (vals input-map)
         parents (if-not (nil? cell) (conj (vec parents) cell) parents)]
     parents)))

(defn group-end [name group-start]
  (p/extend-streams
   {:type :group-end
    :output-name name
    :cell (:cell group-start)}
   [group-start]))

(defn sgroup
  ([input-map output-map]
    (let [merged  (apply p/smerge (vals output-map))
          cell-id (p/generate-name merged "group")]
      (sgroup input-map output-map cell-id)))
  ([input-map output-map cell-id]
    (let [subgraph  (pgu/build-subgraph input-map output-map)
          need-cell (->> subgraph (pgu/find-streams p/cell?) count (not= 0))
          cell      (if need-cell (p/scell cell-id))
          group     (group-start subgraph input-map output-map cell)]
      (reduce
       #(assoc %1 %2 (group-end %2 group))
       {}
       (keys output-map)))))

