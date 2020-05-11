(ns pumpr.transforms.expand-groups-test
  (:require [pumpr.core :as p]
            [pumpr.graph :as pg]
            [pumpr.graph-utils :as pgu]
            [pumpr.eval-executor :as pee]  ;; FIXME: temporary! switch to working with analysis nodes instead of compile nodes
            [pumpr.extra-operators :as peo]
            [pumpr.transforms.expand-groups :as pgeg]
            #?(:clj [clojure.test :refer [deftest is testing]]
               :cljs [cljs.test :refer-macros [deftest is testing]])))

(defn label-node [label-map node]  ;; TODO: move to common test file
  (if (contains? label-map node)
    (get label-map node)
    (if (empty? (:parents node))
      node
      (update-in
       node
       [:parents]
       (partial map (partial label-node label-map))))))

(defn massage-node-map  ;; TODO: move to common test file
  [node-map label-map]
  (reduce-kv
   (fn [acc old-node new-node]
     (assoc
      acc
      (label-node label-map old-node)
      (label-node label-map new-node)))
   {}
   node-map))

(deftest test-expand-groups
  (let [in               (p/sinput :in2)
        sr               (peo/sreduce + 5 in)
        group-start      (-> sr :parents first)
        subgraph         (:subgraph group-start)
        out              (p/soutput :out sr)
        sc               (pee/scompile out)
        cell             (:cell group-start)
        cell-id          (:id cell)
        subgraph-cell-id (-> (#'pgu/find-streams p/cell? subgraph)
                             first
                             :id)
        node-map         (pgeg/expand-groups [sc])
        ;node-map         (pgeg/expand-groups [out])
        actual-out       (get node-map out)
        ;_                (pg/export-graph "out.svg" {} (p/soutput :out group-start))
        _                (pg/export-graph "out.svg" {} (p/soutput :out (get node-map sr)))
        ;_                (pg/export-graph "out.svg" {} actual-out)
         ;_ (println "actual: " actual-out)
        label-map        {in :in
                          sr :sr
                          cell :cell
                          group-start :group-start
                          subgraph :subgraph
                          out :out
                          sc :sc}
        expected         :foo
        actual           (massage-node-map node-map label-map)]
    ;(is (= expected actual))
    ))

