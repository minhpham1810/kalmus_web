from kalmus.utils.artist import compute_most_vivid_color

from kalmus.metrics.color_metrics.ColorMetric import ColorMetric


class MostVividColorMetric(ColorMetric):
    color_metric_type = "most_vivid"

    @classmethod
    def get_color(cls, frame):
        return compute_most_vivid_color(frame)
