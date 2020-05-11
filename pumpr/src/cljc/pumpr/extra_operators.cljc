(ns pumpr.extra-operators
  (:require [pumpr.core :as p]
            [pumpr.group :as pgrp]))

(defn- debug-print [label x]
  (println (str label ":") x))

(defn sdebug [label s]
  (p/sdo (partial debug-print label) s))

(defn sreduce
  ([f initial s] (sreduce f initial (p/generate-name {:s s, :f f} "reduce") s))
  ([f initial cell-id s]
    (->>
     (pgrp/sgroup
      {:in s}
      {:out
       (let [c (p/scell cell-id initial)
             l (p/sload c s)]
         (->> (p/smerge [l s])
              (p/smap (fn [[acc next]] (f acc next)))
              (p/sstore c)))})
     (:out))))

