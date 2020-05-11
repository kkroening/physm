(ns pumpr.eval-executor
  (:require [pumpr.util :refer [big-integer make-exception]]
            [pumpr.core :as p]
            [pumpr.graph-utils :as pgu]
            [pumpr.group :as pgrp]
            [clojure.set :refer [rename-keys]]
            [clojure.algo.generic.functor :refer [fmap]]))

(def ^:private cell-update-types
  #{:cell-store-update
    :cell-group-update
    :cell-merge-update})

(def cell-update?
  (partial p/is-one-of-types cell-update-types))

(defn- scell-store-update [s]
  {:pre [(= (:type s) :store)]}
  (let [c  (:cell s)
        id (:id c)]
    (p/extend-streams {:type :cell-store-update, :cell c, :id id} [s])))

(defn- scell-merge-update
  "Merge a set of cell updates into a parent cell update."
  [stream-map]
  {:pre [(map? stream-map)
         (not (some #(not (cell-update? %)) (vals stream-map)))
         (let [cells (->> stream-map vals (map :cell))]
           (not (some (partial not= (first cells)) cells)))]}
  (let [cell (->> stream-map vals first :cell :parents first)
        _    (assert (not (nil? cell)))
        id   (:id cell)]
    (p/extend-streams
     {:type :cell-merge-update
      :cell cell
      :id id
      :parent-labels (keys stream-map)}
     (vals stream-map))))

(defn- scell-group-update
  "Update cell for an unexpanded group; takes output from `group-start` node and extracts cell values."
  [s]
  {:pre [(= (:type s) :group-start)]}
  (let [c  (:cell s)
        id (:id c)]
    (->> s
         (pgrp/group-end id)
         vector
         (p/extend-streams
          {:type :cell-group-update
           :cell c
           :id id}))))

(defn- add-parents [sc new-parents]
  (-> sc
      (update-in [:parents] #(into % new-parents))
      (merge (pgu/topo-sort new-parents #{} (:nodes sc) (:successors sc)))))

(defn- get-cell-path
  ([c] (get-cell-path c (list)))
  ([c p]
    (let [p' (conj p (:id c))]
      (if (-> c :parents empty?)
        p'
        (get-cell-path
         (-> c :parents first)
         p')))))

(defn- get-cell-update-tree-path
  "Weird helper function for building path into cell update tree; e.g. [:a :b :c] -> [:a :children :b :children:c :leaf]"
  [p]
  (->> p                               ;; e.g. (:a :b :c)
       (interleave (repeat :children)) ;; e.g. (:children :a :children :b :children :c)
       (drop 1)                        ;; e.g. (:a :children :b :children :c)
       vec                             ;; e.g. [:a :children :b :children :c]
       (#(conj % :leaf))))             ;; e.g. [:a :children :b :children :c :leaf]

(defn- build-cell-update-tree [leaves]
  {:pre [(not (some #(not (p/is-one-of-types #{:store :group-start} %)) leaves))]}
  (reduce
   #(update-in %1 (-> %2 :cell get-cell-path get-cell-update-tree-path) (constantly %2))
   {}
   leaves))

(defn- make-cell-updates [cell-update-tree-node]
  (if (-> cell-update-tree-node keys empty?)
    nil
    (if (contains? cell-update-tree-node :leaf)
      (let [leaf (:leaf cell-update-tree-node)]
        (case (:type leaf)
          :store (scell-store-update leaf)
          :group-start (scell-group-update leaf)
          (throw (Exception. (str "Don't know how to build cell update for node of type '" (:type leaf) "'")))))
      (do
        (-> cell-update-tree-node
            :children
            (#(fmap make-cell-updates %))
            scell-merge-update)))))

(defn- updateable? [s]
  (and (p/is-one-of-types #{:store :group-start} s)
       (:cell s)))

(defn- compile-cell-updates [sc]
  (let [cells   (->> sc  ;; FIXME: make stores take cell as parent; have to look up additional cells from stores for now.
                     (pgu/find-streams p/cell-store?)
                     (map :cell)
                     set
                     (into (set (pgu/find-streams p/cell? sc))))
        updates (->> sc
                     (pgu/find-streams updateable?)
                     build-cell-update-tree
                     vals
                     (map make-cell-updates))]
    (-> sc
        (assoc :cells cells)
        (add-parents updates))))

(defn- get-node-priority-map [{:keys [nodes]}]
  (apply merge (map-indexed #(hash-map %2 %1) nodes)))

(defn- compile-node-priority-map [sc]
  (assoc sc :node-priority-map (get-node-priority-map sc)))

(defn- get-input-map [sc]
  (->> sc
       (pgu/find-streams #(or (p/input? %) (p/cell? %)))
       (reduce #(assoc %1 (:id %2) %2) {})))

;; Note: includes cell inputs.
(defn- compile-input-map [sc]
  (assoc sc :input-map (get-input-map sc)))

(defn- strip-analysis [streams]
  (if (apply pgu/analyzed? streams)
    (-> streams first :parents)
    streams))

(defn- check-can-compile-streams [streams]  ;; TODO: allow compilation of analyzed streams
  (let [invalid-stream-types
          (->> streams
               strip-analysis
               (map :type)
               (filter #(and (not= % :output)
                             (not= % :store)))
               (set))]
    (if-not (empty? invalid-stream-types)
      (throw (make-exception (str "Can only compile output stream(s); got " invalid-stream-types))))))

(defn scompile [& streams]
  ;; TODO: compile group subgraphs
  (if (and (= (count streams) 1) (= (:type (first streams)) :compile))
    (first streams)
    (do
      (check-can-compile-streams streams)
      (-> (apply pgu/analyze streams)
          (assoc :type :compile)
          (compile-cell-updates)
          (compile-node-priority-map)
          (compile-input-map)))))
(defn compiled? [& streams]
  (and
   (->> streams count (= 1))
   (->> streams first (p/is-type :compile))))

(defn select-exec-node  ;; TODO: change to take set of pending-nodes instead of seq.
  "Choose next stream node to execute."
  [{:keys [nodes node-priority-map successors]} pending-nodes]
  (->> pending-nodes
       (filter #(not (empty? (get successors %))))  ;; TODO: precompute list of executable nodes; e.g. leave out root cell updates and outputs.
       (map #(get node-priority-map %))
       (reduce min big-integer)
       (get nodes)))

(defn- get-output-streams [{:keys [successors]} exec-node]
  (get successors exec-node))

(defn- add-output [exec-node value event-map dest-stream]
  (update-in event-map [dest-stream] assoc exec-node value))

(defn- add-outputs [event-map exec-node output-streams output-value]
  (reduce (partial add-output exec-node output-value) event-map output-streams))

(defn tick-compiled
  ([exec-fn event-map sc]
    (tick-compiled exec-fn event-map sc (select-exec-node sc (keys event-map))))
  ([exec-fn event-map sc next-exec-node]
    ;(println (str "Ticking [" (:type exec-node) "] ... " (dump-state sc event-map)))
    (if (or (nil? next-exec-node) (= (:type next-exec-node) :output))
      event-map
      (let [inputs               (get event-map next-exec-node)
            [output-value valid] (exec-fn next-exec-node inputs)
            output-streams       (if valid (get-output-streams sc next-exec-node) [])]
        (-> event-map
            (dissoc next-exec-node)
            (add-outputs next-exec-node output-streams output-value))))))

(defn- tick [exec-fn event-map & streams]
  (tick-compiled exec-fn event-map (apply scompile streams)))

(defn- map-input [sc event-map input-id input-value]
  {:pre [(= (:type sc) :compile)]}
  (let [input-stream (get (:input-map sc) input-id)
        _            (if (nil? input-stream)
                         (throw (make-exception (str "Invalid input stream: " input-id))))
        ;output-streams (get-output-streams sc input-stream)
        ]
    ;(add-outputs event-map input-stream output-streams input-value)
    (assoc event-map input-stream {nil input-value})))

(defn map-inputs [inputs sc]
  (reduce-kv (partial map-input sc) {} inputs))

(defn- map-output [outputs output-stream event-map]
  {:pre [(or (p/output? output-stream)
             (cell-update? output-stream))]}
  (assoc outputs (:id output-stream) (first (vals event-map))))

(defn map-outputs [sc event-map]
  {:pre [(= (:type sc) :compile)]}
  (reduce-kv map-output {} event-map))

(defn do-run [exec-fn event-map sc]
  (loop [event-map event-map, prev-event-map nil]
    (if (= event-map prev-event-map)
      (map-outputs sc event-map)
      (recur (tick-compiled exec-fn event-map sc) event-map))))

(defmulti exec-node (fn [s inputs] (:type s)))

(defn run [input-map & streams]
  (let [sc        (apply scompile streams)
        event-map (map-inputs input-map sc)]
    (do-run exec-node event-map sc)))

(defmethod exec-node :input [s input-map]
  (let [out (first (vals input-map))]
    [out true]))

(defmethod exec-node :map [s input-map]
  {:pre [(= (count input-map) 1)]}
  (let [in  (first (vals input-map))
        out ((:fn s) in)]
    [out true]))

(defmethod exec-node :filter [s input-map]
  {:pre [(= (count input-map) 1)]}
  (let [in    (first (vals input-map))
        valid ((:fn s) in)]
    [in valid]))

(defmethod exec-node :merge [s input-map]
  (let [parents (:parents s)
        valid   (not= 0 (count input-map))
        out     (if (contains? s :parent-labels)
                  (rename-keys input-map (zipmap parents (:parent-labels s)))  ;; TODO: generate label-map in compile stage.
                  (map (partial get input-map) parents))]
    [out valid]))

(defmethod exec-node :do [s input-map]
  {:pre [(= (count input-map) 1)]}
  (let [in (first (vals input-map))]
    ((:fn s) in)
    [in true]))

(defmethod exec-node :cell [s input-map]
  (let [out (first (vals input-map))]
    [out true]))

(defmethod exec-node :load [s input-map]
  (let [c             (:cell s)
        cell-value    (get input-map c (:initial c))
        valid         (contains? input-map (get (:parents s) p/sload-trigger-index))]
    [cell-value valid]))

(defmethod exec-node :store [s input-map]
  (let [out (first (vals input-map))]
    [out true]))

(defn- get-subgraph-label-map [{:keys [parents cell input-map]}]
  ;; TODO: generate label-map in compile stage.
  (let [parents (filter (partial not= cell) parents)
        labels  (keys input-map)]
    (zipmap parents labels)))

(defn- get-subgraph-cell-ids [{:keys [subgraph]}]
  ;; TODO: generate subgraph-cell-ids in compile stage.
  (->> subgraph
       (pgu/find-streams p/cell?)
       (map :id)))

(defn- get-subgraph-cell-map [s input-map]
  (let [group-cell-value  (get input-map (:cell s) {})
        subgraph-cell-ids (get-subgraph-cell-ids s)
        ids               (filter (partial contains? group-cell-value) subgraph-cell-ids)
        values            (map group-cell-value subgraph-cell-ids)]
    (zipmap ids values)))

(defn- get-subgraph-input-map [s input-map]
  (-> input-map
      (dissoc (:cell s))
      (rename-keys (get-subgraph-label-map s))
      (merge (get-subgraph-cell-map s input-map))))

(defn- get-group-start-output-map [s subgraph-output-map]
  (let [subgraph-cell-ids (get-subgraph-cell-ids s)
        group-cell-id     (-> s :cell :id)
        group-cell-value  (select-keys subgraph-output-map subgraph-cell-ids)]
    (-> (apply dissoc subgraph-output-map subgraph-cell-ids)
        (assoc group-cell-id group-cell-value)
        (dissoc nil))))

(defmethod exec-node :group-start [s input-map]
  (let [subgraph            (:subgraph s)
        subgraph-input-map  (get-subgraph-input-map s input-map)
        subgraph-output-map (run subgraph-input-map (scompile subgraph))
        output-map          (get-group-start-output-map s subgraph-output-map)
        valid               (count output-map)]
    [output-map valid]))

(defmethod exec-node :group-end [s input-map]
  (assert (= 1 (count input-map)))
  (let [input (first (vals input-map))
        valid (contains? input (:output-name s))
        out   (get input (:output-name s))]
    [out valid]))

