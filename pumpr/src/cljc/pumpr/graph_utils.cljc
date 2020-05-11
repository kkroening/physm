(ns pumpr.graph-utils
  (:require [pumpr.core :as p]))

(defn topo-sort
  ([streams] (topo-sort streams #{}))
  ([streams cutoff] (topo-sort streams cutoff [] {}))
  ([streams cutoff nodes successors]
    {:pre [(sequential? streams)
           (set? cutoff)]}
    (loop [stack (vec streams), node-vec (vec nodes), node-set (set nodes), successors successors]
      (if (empty? stack)
        {:nodes node-vec, :successors successors}
        (let [s          (peek stack)
              parents    (:parents s)
              unvisited  (filter #(not (or (contains? successors %) (contains? cutoff %))) parents)
              add-succ   (fn [child parent]
                           (update-in child [parent] #(conj (or % #{}) s)))
              successors (reduce add-succ successors parents)
              stack      (if (empty? unvisited) (pop stack) stack)
              should-add (and (empty? unvisited)
                              (not (contains? node-set s)))
              node-vec   (if should-add (conj node-vec s) node-vec)
              node-set   (if should-add (conj node-set s) node-set)
              stack      (apply (partial conj stack) unvisited)]
          (recur stack node-vec node-set successors))))))

(defn analyzed? [& streams]
  (and
   (->> streams count (= 1))
   (->> streams first (p/is-one-of-types #{:analysis :compile}))))  ;; FIXME: don't depend on :compile

(defn analyze [& streams]
  (if (apply analyzed? streams)
    (first streams)
    (-> {:type :analysis}
        (p/extend-streams streams)
        (merge (topo-sort streams)))))

(defn- pre-transplant [node node-map new-parents]
  ;; TODO: consider removing :cell from load/store so that we don't need pre-transplant at all.
  (cond
    (or (p/cell-load? node) (p/cell-store? node))
      (update-in node [:cell] #(get node-map % %))
    (p/is-type :compile node)
      (apply analyze new-parents)
    :else
      node))

(defn transplant [node node-map]
  ;; TODO: possibly throw exception if trying to transplant :compile nodes; either that or recompile.
  (let [new-parents (map #(get node-map % %) (:parents node))
        _           (assert
                     (not (some nil? new-parents))
                     (str
                      "Failed to map one or more parents: "
                      {:old-parents (map #(dissoc % :parents) (:parents node))
                       :new-parents new-parents}))
        node        (pre-transplant node node-map new-parents)]
    (if-not (:parents node)
      node
      (p/extend-streams node new-parents))))

(defn walk-graph
  ([streams cutoff f]
    (walk-graph streams cutoff nil f))
  ([streams cutoff initial-context f]
    (let [{:keys [nodes successors]} (topo-sort streams cutoff)]
      (loop [context initial-context, nodes nodes]
        (if (empty? nodes)
          context
          (let [node    (first nodes)
                context (f node (get successors node) context)
                nodes   (drop 1 nodes)]
            (recur context nodes)))))))

(defn transplant-many
  ([streams node-map]
    (transplant-many streams transplant node-map))
  ([streams transplant-fn node-map]
    (walk-graph
     streams
     (set (keys node-map))
     node-map
     (fn [node successors node-map]
       (assoc node-map node (transplant-fn node node-map))))))

(defn find-streams [f & streams]
  (->> streams
       (apply analyze)
       :nodes
       (filter f)))

(defn build-subgraph
  [input-map output-map]
  (let [node-map   (zipmap (vals input-map) (map p/sinput (keys input-map)))
        node-map   (transplant-many (vals output-map) node-map)
        get-output (fn [[id stream]]
                     (p/soutput id (get node-map stream)))
        outputs    (map get-output (seq output-map))]
    (apply analyze outputs)))

