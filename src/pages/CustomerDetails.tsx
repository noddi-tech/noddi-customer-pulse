import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCustomerDetails } from "@/hooks/segmentation";
import { ArrowLeft, ExternalLink, AlertCircle } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

export default function CustomerDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useCustomerDetails(Number(id));

  if (isLoading) {
    return <div className="text-center py-8">Loading customer details...</div>;
  }

  if (!data?.customer) {
    return <div className="text-center py-8">Customer not found</div>;
  }

  const { customer, bookings, features, segments } = data;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate("/customers")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Customers
      </Button>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">
                {customer.first_name} {customer.last_name}
              </CardTitle>
              <p className="text-muted-foreground">{customer.email}</p>
              {customer.phone && (
                <p className="text-sm text-muted-foreground">{customer.phone}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Badge variant={segments?.lifecycle === "Churned" ? "destructive" : "default"}>
                {segments?.lifecycle}
              </Badge>
              <Badge variant="secondary">{segments?.value_tier}</Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {features?.recency_days ? `${features.recency_days} days` : "N/A"}
            </div>
            {features?.last_booking_at && (
              <p className="text-xs text-muted-foreground mt-1">
                Last booking: {formatDistanceToNow(new Date(features.last_booking_at), { addSuffix: true })}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Frequency (24m)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{features?.frequency_24m || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Total bookings</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Revenue (24m)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              €{Number(features?.revenue_24m || 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Margin: €{Number(features?.margin_24m || 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Service Tags */}
      {features?.service_tags_all && Array.isArray(features.service_tags_all) && features.service_tags_all.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Service Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {features.service_tags_all.map((tag: any) => (
                <Badge key={String(tag)} variant="outline">
                  {String(tag)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Seasonal Indicator */}
      {features?.seasonal_due_at && (
        <Card>
          <CardHeader>
            <CardTitle>Next Service Due</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg">
              {formatDistanceToNow(new Date(features.seasonal_due_at), { addSuffix: true })}
            </p>
            <p className="text-sm text-muted-foreground">
              Due date: {format(new Date(features.seasonal_due_at), "PPP")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Booking Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Booking History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {bookings && bookings.length > 0 ? (
            bookings.map((booking: any) => (
              <Card key={booking.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-medium">
                      {booking.started_at ? format(new Date(booking.started_at), "PPP") : "Date unknown"}
                    </p>
                    <p className="text-sm text-muted-foreground">{booking.status_label}</p>
                  </div>
                  <div className="flex gap-2">
                    {booking.is_cancelled && <Badge variant="destructive">Cancelled</Badge>}
                    {booking.is_fully_paid && <Badge variant="default">Paid</Badge>}
                    {(booking.is_partially_unable_to_complete || booking.is_fully_unable_to_complete) && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Unable to Complete
                      </Badge>
                    )}
                  </div>
                </div>

                {booking.order_lines && booking.order_lines.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-sm font-medium">Order Lines:</p>
                    {booking.order_lines.map((line: any) => (
                      <div key={line.id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {line.description} (x{line.quantity})
                        </span>
                        <span className="font-medium">
                          {line.currency} {Number(line.amount_gross).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-medium pt-2 border-t">
                      <span>Total:</span>
                      <span>
                        {booking.order_lines[0]?.currency || "NOK"}{" "}
                        {booking.order_lines
                          .reduce((sum: number, line: any) => sum + Number(line.amount_gross), 0)
                          .toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </Card>
            ))
          ) : (
            <p className="text-muted-foreground">No bookings found</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
