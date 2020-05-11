(ns pumpr.core
  (:require [pumpr.util :refer [big-integer make-exception]]))

(defn is-type [t s]
  (-> s :type (= t)))

(defn is-one-of-types [types s]
  (contains? (set types) (:type s)))

(defn ^:export sinput [id] {:type :input, :id id})
(def input? (partial is-type :input))

(defn extend-streams [o streams]
  {:pre [(map? o)
         (sequential? streams)]}
  ;(if-not (nil? streams)
    (assoc o :parents (vec streams)))
  ;  o)

(defn slabel [label s]
  (assoc s :label label))

(defn soutput [id s]
  (extend-streams {:type :output, :id id} [s]))
(def output? (partial is-type :output))

(defn smap [f s]
  (extend-streams {:type :map, :fn f} [s]))

(defn sfilter
  ([s] (sfilter (constantly false) s))
  ([f s] (extend-streams {:type :filter, :fn f} [s])))

(defn smerge [streams]
  (cond
    (sequential? streams)
      (extend-streams {:type :merge} (vec streams))
    (map? streams)
      (extend-streams {:type :merge, :parent-labels (keys streams)} (vals streams))
    :else
      (throw (make-exception "Merge requires sequence or map of input streams"))))

(defn sdo [f s]
  (extend-streams {:type :do, :fn f} [s]))

(defn scell
  ([id] (scell id nil))
  ([id initial] {:type :cell, :id id, :initial initial})
  ([id initial parent] (extend-streams (scell id initial) [parent])))
(def cell? (partial is-type :cell))
(defn root-cell? [s]
  (and
   (cell? s)
   (-> s :parents empty?)))

(def sload-trigger-index 0)
(def sload-cell-index 1)
(defn sload [c s]
  (extend-streams {:type :load, :cell c} [s c]))  ;; TODO: consider removing :cell
(defn cell-load? [s]
 (is-type :load s))

(defn sstore [c & streams]
  (extend-streams {:type :store, :cell c} streams))  ;; TODO: consider removing :cell
(defn cell-store? [s]
 (is-type :store s))
(defn root-cell-store? [s]
  (and
   (is-type :store s)
   (root-cell? (:cell s))))

(defn generate-name [s type]
  (let [h (hash s)
        h (max h (- h))]
    (keyword (str type h))))

