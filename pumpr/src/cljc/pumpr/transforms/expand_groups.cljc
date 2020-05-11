(ns pumpr.transforms.expand-groups
  (:require [pumpr.util :refer [make-exception]]
            [pumpr.core :as p]
            [pumpr.graph-utils :as pgu]
            [pumpr.eval-executor :as pee]  ;; FIXME: temporary!  work with analyzed nodes instead of compiled nodes
            [clojure.algo.generic.functor :refer [fmap]]))

(defn- expanded-group [output-map s cell]
  (p/extend-streams
   {:type :expanded-group
    :output-map output-map
    :cell cell}
   (:parents s)))

(defn- do-expand-groups [streams]
  (pgu/walk-graph
   streams
   #{}
   (fn [node successors node-map]
     (cond
       (= (:type node) :group-start)
         (let [subgraph            (:subgraph node)
               cell                (:cell node)
               subgraph-inputs     (pgu/find-streams p/input? subgraph)
               subgraph-outputs    (pgu/find-streams p/output? subgraph)
               subgraph-cells      (pgu/find-streams p/root-cell? subgraph)
               subgraph-stores     (pgu/find-streams p/root-cell-store? subgraph)
               subgraph-input-map  (:input-map subgraph)
               sub-cells           (map #(p/extend-streams % [cell]) subgraph-cells)  ;; TODO: move to function
               sub-cell-map        (zipmap subgraph-cells sub-cells)
               subgraph-node-map   (->> (map :id subgraph-inputs)
                                        (map (partial get subgraph-input-map))
                                        (zipmap subgraph-inputs)
                                        (merge sub-cell-map)
                                        (pgu/transplant-many subgraph-outputs))
               cell-store          (->> (map subgraph-node-map subgraph-cells)
                                        (zipmap (map :id subgraph-cells))
                                        (p/smerge)
                                        (p/sstore cell))
               subgraph-output-map (->> (map subgraph-node-map subgraph-outputs)
                                        (zipmap (map :id subgraph-outputs))
                                        (fmap #(-> % :parents first))
                                        (#(assoc % (:id cell) cell-store))
                                        (#(dissoc % nil)))
               eg                  (expanded-group subgraph-output-map node cell)]
            (assoc node-map node eg))
       (= (:type node) :group-end)
         (let [parents             (:parents node)
               _                   (assert (= 1 (count parents)))
               eg                  (get node-map (first parents))
               _                   (assert (not (nil? eg)))
               _                   (assert (= :expanded-group (:type eg)))
               subgraph-output-map (:output-map eg)
               output-name         (:output-name node)
               _                   (assert (not (nil? output-name)))
               is-cell             (= (-> eg :cell :id) output-name)
               output              (if is-cell
                                     (throw (make-exception "FIXME: Cannot expand groups in compiled graphs yet; choking on cell group-end"))
                                     (get subgraph-output-map output-name))
               _                   (assert (not (nil? output)))]
           (assoc node-map node output))
       :else
         (assoc node-map node node)))))

(defn expand-groups [streams]
  (if (pee/compiled? streams)
    ;; FIXME: temporary hack to strip :compile node and recompile after expansion
    ;; should improve this so that the node-map can keep track of cell-update nodes
    (let [sc          (first streams)
          streams     (->> sc :parents (filter p/output?))  ;; strip extra stuff, like cell updates
          node-map    (do-expand-groups streams)
          new-streams (map node-map streams)
          new-sc      (apply pee/scompile new-streams)
          node-map    (assoc node-map sc new-sc)]
      node-map)
    (do-expand-groups streams)))

