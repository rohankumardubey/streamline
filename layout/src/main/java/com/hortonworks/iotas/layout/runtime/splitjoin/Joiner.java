/**
 *
 */
package com.hortonworks.iotas.layout.runtime.splitjoin;

import com.hortonworks.iotas.streams.IotasEvent;

/**
 * Joins the received {@link EventGroup} and generates a resultant {@link IotasEvent}
 *
 */
public interface Joiner {

    public IotasEvent join(EventGroup eventGroup);
}
