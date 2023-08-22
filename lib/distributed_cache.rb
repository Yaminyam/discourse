# frozen_string_literal: true

require "message_bus/distributed_cache"

class DistributedCache < MessageBus::DistributedCache
  def initialize(key, manager: nil, namespace: true)
    super(key, manager: manager, namespace: namespace, app_version: Discourse.git_version)
  end

  # Defer setting of the key in the cache for performance critical path to avoid
  # waiting on MessageBus to publish the message which involves writing to Redis.
  def defer_set(k, v)
    Scheduler::Defer.later("#{@key}_set") { self[k] = v }
  end

  def defer_get_set(k, &block)
    return self[k] if hash.key? k
    value = block.call
    self.defer_set(k, value)
    value
  end

  def defer_get_set_bulk(ks, key_blk, &blk)
    found_keys, missing_keys = ks.partition { |k| hash.key?(key_blk.call(k)) }

    missing_values = blk.call(missing_keys)
    missing_hash = missing_keys.zip(missing_values).to_h

    Scheduler::Defer.later("#{@key}_bulk_set") do
      missing_hash.each { |key, value| self[key_blk.call(key)] = value }
    end

    missing_hash.merge(found_keys.map { |key| [key_blk.call(key), self[key]] }.to_h)
  end

  def clear(after_commit: true)
    if after_commit && !GlobalSetting.skip_db?
      DB.after_commit { super() }
    else
      super()
    end
  end
end
